# Architecture proposals — DATA slice — ADR-DATA-07 — The delivery store is per-requirement documents behind a capability-split writer

Part 20 of 25 of [the data proposal](../data.md), which indexes every part.

## ADR-DATA-07 — The delivery store is per-requirement documents behind a capability-split writer

### Decision to be made

The file granularity of the delivery record store, and how the single-write-path and
separately-grantable-read/write requirements are made structural rather than conventional.

### Constraints that bear on it

- **H1.** `REQ-CONFIG-192` fixes the directory (`.rotaris/<store_subpath>/`, default `requirements`),
  that it holds **operational records only** and never requirement text, and four settings:
  `schema_version` (written into every record), `retain_tombstones`, `audit_trail`, `history_limit`
  (200 per requirement). It does **not** fix the file granularity.
- **H2.** Forward-tolerant version handling; an unsupported record left on disk and reported in
  exactly three places while the workspace still opens.
- **H3.** `REQ-TRACE-399`: one write path; **a guard test asserts no module writes the delivery store
  directly**. `REQ-TRACE-403`: reading and writing separately grantable, with a guard test asserting
  a read-only composition offers no state-changing operation at all.
- **H4.** `REQ-TRACE-405`: every state-changing action writes who, when, which requirement, and the
  requirement's hash at that instant, distinguishable as person or machine (`REQ-CONFIG-198` fixes
  what counts as a person). `REQ-TRACE-402`: the application **refuses to start** if assembled with a
  writer that does not compare the hash.
- **H5.** `REQ-TRACE-476`: restart rebuilds delivery state, units, queued and running runs, and
  worktrees from what was persisted; a dead run is reported interrupted with its work retained; the
  queue resumes without re-running completed units; no requirement silently reset.
- **C1.** No locking; read-modify-write immediately before the write; unbounded concurrent writers.
- **G2.** `REQ-TRACE-239`: 100 ms to put a board on screen, not growing with store size.

### Alternative A — one document for the whole store

A single `delivery.json` holding every requirement's state, history and audit trail.

One read to build a board, trivially consistent, and the cheapest thing to write. But under **C1**'s
read-modify-write-with-no-locking rule, *every* transition rewrites the whole store, so two
concurrent transitions on two **different** requirements can lose one of them. That directly
contradicts `REQ-TRACE-388`, which bounds concurrency per requirement and explicitly places "no
further bound… on how many actions may be in flight across **different** requirements, each being
independent". A single document makes them not independent. It also makes **H2** unworkable: an
unsupported `schema_version` on one record must leave its neighbours readable, which a single
document cannot do.

### Alternative B — one document per requirement, plus an append-only audit log

`.rotaris/requirements/<requirement-id>.json` holding that requirement's delivery state, its
`history_limit`-bounded history, its run records and its worktree references; plus
`audit.jsonl` appended to for the audit trail; plus a `tombstones` record for retained ids.

Concurrent transitions on different requirements touch different files and cannot collide, which is
what `REQ-TRACE-388` describes. An unsupported record isolates to one requirement, which is what
**H2** requires. History pruning to 200 is a rewrite of one small document.

The cost: building a board reads N documents. At `REQ-TRACE-300`'s scale — 100 populated columns, a
store of several hundred requirements — that is several hundred small reads per board build, against
`REQ-TRACE-239`'s 100 ms budget. Note that the budget is on **putting the board on screen once the
engine has answered**, not on the engine's read, and that the read is required to be off the
interface thread anyway (**G10**); so the constraint is softer than it first appears. It should still
be measured before the gate.

### Alternative C — one document per transition (an append-only event log per requirement)

Never rewrite; only append. Concurrency-free, and a natural fit for the audit trail.

It fails `history_limit`: `REQ-CONFIG-192` requires older history entries to be **pruned**, which an
append-only log cannot do without rewriting, at which point it is Alternative B with more files. It
also makes `REQ-TRACE-476`'s restart rebuild a fold over every transition ever recorded rather than a
read of current state, and makes `REQ-TRACE-279`'s revision-history join more expensive rather than
less.

### Recommendation

**Alternative B.** One document per requirement, an append-only audit log beside it, and a tombstone
record. Every document carries `schema_version` and is read forward-tolerantly per **H2**.

Two structural points matter more than the layout:

**The write path is a capability, not a convention.** `REQ-TRACE-403` requires that a component given
read access "SHALL have **no route** by which to change a delivery state, write an audit record or
start a run", and that a guard test assert it. The way to satisfy that is two distinct handle types —
a reader value that carries only query methods and a writer value that carries the transition
function — with the reader obtainable without the writer and never derivable from it. A single
service object with a naming convention does not satisfy a test that asserts the read-only
composition "offers no state-changing operation at all"; that test can only pass if the operations
are genuinely absent from the value.

**The startup assertion is real code.** `REQ-TRACE-402`: "Where the application is assembled with a
delivery-state writer that does not make that comparison, it SHALL **refuse to start** and SHALL name
the comparison that is missing." So the writer declares, as data the assembly can inspect, that it
performs the specification-hash comparison, and startup checks that declaration and aborts with a
named message if it is absent. This is unusual and worth stating plainly: the specification is asking
for a self-check on the composition, not merely for correct behaviour. It pairs with
`REQ-TRACE-377`'s and `REQ-TRACE-399`'s guard tests as a small family of structural assertions this
slice owes.

`REQ-CONFIG-198`'s definition of **a person** is what the audit record's actor field must carry: the
action arrived through an interactive surface, in direct answer to a prompt raised for that specific
action, with that surface attached to a window. Anything from an agent, a hook, a scheduled or
unattended run, or a replay is not a person "whatever it claims about itself". So the actor is
determined at the boundary where the action enters the process, not asserted by the caller — which
means the transition function's signature must take an attribution value that only the interactive
boundary can construct.

### Consequences accepted

- N reads to build a board, mitigated by the read being off the interface thread and measurable
  against `REQ-TRACE-239`.
- Two files change per transition — the requirement document and the audit log — with no transaction
  between them. `REQ-TRACE-405` requires the record to exist; the ordering is ours to choose, and the
  audit entry should be appended **after** the state document is replaced, so a crash between them
  leaves a state with no audit line rather than an audit line for a state that was never reached.
  That direction is a judgement, not a requirement, and is worth confirming (**OQ-2**).
- Directory growth is one file per requirement, which for a store of a few thousand requirements is
  ordinary.

### What would have to change to revisit this

A measured failure to meet `REQ-TRACE-239` at `REQ-TRACE-300`'s scale, which would push toward a
per-column or per-epic grouping of documents; or `REQ-CONFIG-192` gaining a statement about file
granularity, which would settle **OQ-1** and might settle this.

---
