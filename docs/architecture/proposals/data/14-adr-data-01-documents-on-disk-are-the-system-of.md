# Architecture proposals — DATA slice — ADR-DATA-01 — Documents on disk are the system of record; no relational database

Part 14 of 25 of [the data proposal](../data.md), which indexes every part.

## ADR-DATA-01 — Documents on disk are the system of record; no relational database

### Decision to be made

Whether the product keeps any state in SQLite — the candidate stack names SQLite with Drizzle and
better-sqlite3 — and if so, for what.

### Constraints that bear on it

- **A5, A6.** Every persisted artifact in this slice is a named file in a fixed format at a fixed
  path. No requirement in any of the twenty-one domain documents names a database, a table, an
  index, a query or a migration. The only versioning concept is `schema_version` as a field *inside
  a record* (`REQ-CONFIG-192`, `REQ-SESSION-013`, the `REQ-EVENTS` envelope), read forward-tolerantly
  and never migrated in place — `REQ-CONFIG-192`: "Neither is rewritten, migrated in place, or
  deleted."
- **C1.** `REQ-LIBRARY-042`, `REQ-LIBRARY-158` and `REQ-TRACE-502` fix the multi-process semantics as
  *no locking, no waiting, last complete replacement wins*. `REQ-TRACE-502` is emphatic: "no
  invocation SHALL wait for another… An invocation SHALL NEVER fail, hang or leave a lock behind
  because another was running."
- **G1.** `REQ-TRACE-089` forbids carrying any result between invocations and forbids consulting a
  stored summary in place of reading the files. `REQ-TRACE-152` limits the toolchain's writes to two
  named actions, so there is nowhere an index could legally live.
- **D6.** `REQ-CONFIG-014`: the configuration file set has no read cache.
- **B10.** Reading a workspace must not write to it (`REQ-TRACE-090`, `REQ-TRACE-408`,
  `REQ-LIBRARY-051`, `REQ-CONFIG-419`, `REQ-TRACE-497`).
- **A4.** The requirement documents are the *project's* files, versioned in the project's own
  repository and hand-edited — `REQ-TRACE-275`: "there is no second requirement repository".
- **H2.** An unsupported record must stay on disk untouched and be reported in three named places
  while the workspace still opens and still runs.
- **C5.** `REQ-GIT-145`: unbounded concurrent isolated runs in one workspace.

### Alternative A — SQLite as the primary store for delivery records, traceability and improvement artifacts

The case for this is not weak and deserves to be put properly.

The traceability domain is the largest in the product at 512 identifiers, and it is the one place
where the data is genuinely relational: requirements have parents, derived-from links, twelve
relation kinds (`REQ-TRACE-274`), evidence sites, verification records, delivery transitions and
revision history. `REQ-TRACE-279` requires revision history to be produced by *joining* the source's
revisions against locally recorded hashes and the delivery records — "joins" is the specification's
own word. `REQ-TRACE-459` requires a transitive closure over dependency ancestors, topologically
sorted, identical on every read of an unchanged project. `REQ-TRACE-404` requires a bulk action
evaluated and reported per requirement. A board of several hundred requirements, filtered on six
axes (`REQ-TRACE-293`) and sorted three ways (`REQ-TRACE-287`), is on its face a query workload.

SQLite would also supply things the file design has to build by hand: one transaction covering
"write the delivery record **and** the audit entry **and** prune history to 200"; crash atomicity
across several records without inventing an ordering; an `ORDER BY` that does not require loading
every record; and `history_limit` pruning as a `DELETE` rather than a directory scan. And the file
design's cost is real — `REQ-TRACE-173` accepts N full repository scans for N single-requirement
queries as "a documented cost", which SQLite would remove.

**Why it nonetheless fails.** Not on taste or effort, but on observables the specification fixes.

1. *It cannot produce C1's concurrency observables.* SQLite coordinates writers with locks; under
   WAL a second writer receives `SQLITE_BUSY` and either waits on a busy timeout or fails.
   `REQ-TRACE-502` requires both that no invocation waits for another **and** that none ever fails
   because another was running. `REQ-LIBRARY-042` requires two interleaved writers both to succeed
   with the later winning whole, not one to be refused. An unbounded busy timeout satisfies the
   second half by violating the first. The two halves are jointly unsatisfiable by a lock-based
   store.
2. *It cannot produce G1's freshness observable.* `REQ-TRACE-089` requires each operation to read the
   files. A database answering from stored rows is precisely the "stored summary consulted in place
   of reading the files" that requirement names. A database that re-read every file on every
   operation and then wrote rows would do strictly more work than the file design *and* violate
   **B10** by writing on a read path.
3. *It cannot hold the requirement documents at all.* They are the project's Markdown, under the
   project's version control, written back through the adapter "into the **original artifact** — the
   project's own file, never a local copy" (`REQ-TRACE-434`). Any database copy is a second
   definition of the requirement set, which `REQ-TRACE-197` forbids in terms.
4. *`schema_version` semantics are per-record and forward-tolerant, not per-database.*
   `REQ-CONFIG-192` requires an unsupported record to sit uninterpreted and unmigrated while its
   neighbours read normally, and the board to show that one requirement's history as unavailable
   *for that reason*. A migrating ORM's contract is the opposite: bring the whole store to the
   current version, or refuse to open it.
5. *It buys nothing for configuration.* `REQ-CONFIG-014` forbids a read cache and the files are the
   user's own hand-authored YAML.

### Alternative B — SQLite as a rebuildable derived index alongside the files

Files stay authoritative; a database is maintained as a cache to make board queries cheap, discarded
and rebuilt whenever it might be stale.

This is the strongest form of the SQLite argument and it survives objections 3 and 4. It still fails
on 1 and 2, and adds two problems of its own. Maintaining it is a write, so the read paths **B10**
protects would begin writing. Detecting staleness cheaply requires exactly the stored summary
`REQ-TRACE-089` forbids consulting; detecting it expensively, by re-reading every file, leaves no
saving. And under **C5** several processes would maintain the same cache concurrently under **C1**'s
no-lock rule, which is the worst of both designs.

A narrower version of B does survive, and is what I recommend elsewhere: a **process-lifetime,
in-memory** index rebuilt per pass and never written to disk. `REQ-TRACE-089`'s closing sentence
permits it explicitly — "How often the work is repeated within one invocation SHALL make no
difference to what that invocation reports" — and `REQ-TRACE-202` and `REQ-TRACE-203` positively
invite it. That is ADR-DATA-06's design, and it needs no database.

### Alternative C — an event-sourced journal with projections for the whole slice

The candidate stack names "an event journal with projections". The specification does define a
journal: `evidence/events.jsonl`, one wire event per line, capped by
`runtime.event_retention_per_session`, trimmed by atomic whole-file replacement, with a resumable
follower protocol keyed on byte offset plus a truncation marker (`REQ-EVENTS-090` to
`REQ-EVENTS-092`, `REQ-EVENTS-111`). But it is **per session**, it is **capped and trimmed**, and its
content is fixed by domain 20's catalogue. It is a record of what a run did, not a storage substrate.

Nothing in this slice is event-sourced. Configuration is a document set with a fixed merge. A
worktree binding is a record of seven fields with a closed vocabulary (`REQ-GIT-015`). An improvement
artifact is a document with an explicitly *separate* version history beside it (`REQ-LIBRARY-049`) —
a document-with-history design, not an event log: version files hold a **full copy** of the artifact,
and pruning discards intermediate versions (`REQ-LIBRARY-052`), which an event log could not survive.
Modelling these as event streams with projections would make the projection, rather than the file,
what a user opens — and every one of these files is specified as a file a user opens.

### Recommendation

**Files are the system of record for the whole of this slice. No SQLite, no ORM, no migrations.**

In one line: the specification does not merely fail to require a database, it fixes concurrency,
freshness and versioning observables that a lock-based, schema-migrating store cannot produce.
`REQ-TRACE-502`, `REQ-TRACE-089` and `REQ-CONFIG-192` each rule it out independently.

Where the relational shape genuinely helps — the board's joins, closures and sorts — the answer is an
in-memory projection built per pass by the requirement engine (ADR-DATA-06) and handed to the
renderer already translated (`REQ-TRACE-378`). `REQ-TRACE-348` already describes it: "A board pass
SHALL be held in **one value** so a reader can never observe half an update."

This removes SQLite, Drizzle and better-sqlite3 from the stack **for this slice**; if another slice
finds a requirement needing them, that is that slice's finding. Note the incidental benefit:
better-sqlite3 is a native module, and dropping it removes per-Electron-version rebuilds and
per-architecture prebuilds from the distribution problem domain 11 owns.

### Consequences accepted

- `REQ-TRACE-173`'s N-scans-for-N-queries cost, accepted exactly as the specification accepts it.
- Cross-record atomicity is built from ordered single-file writes plus the crash-survivable orderings
  **B6** already fixes. There is no transaction spanning two files, and the specification never asks
  for one — it asks for specific orderings that make a crash recoverable.
- History pruning (`history_limit` 200, `REQ-LIBRARY-052`'s 25 versions, `REQ-GIT-049`'s 50
  checkpoints) is directory work, not a `DELETE`.
- Two concurrent decisions on one artifact can lose one, as `REQ-LIBRARY-042` states plainly. We must
  not "improve" on this with a lock.

### What would have to change to revisit this

A requirement fixing a query latency the file design cannot meet; a requirement that a store refuse
or serialise a concurrent writer; a requirement for a transaction spanning two records; or a delivery
store growing past the point where a directory scan per board refresh meets `REQ-TRACE-239`'s 100 ms
budget. The last is the realistic one and is measurable against `REQ-TRACE-300`'s 100-column figure.

---
