# ADR-0061 — The improvement artifact store's write path: rows, one indivisible mutation, two counters

- **Status:** accepted and first executed
- **Date:** 2026-09-11
- **Origin:** OQ-45, which this record closes. The question was never the product's — ESC-30 ruled the
  product half on 2026-09-02 and it was applied the same day. What remained was a decision record nobody
  had written, and the gap survived three storage rulings because each of the records that might have
  held it was about something else.
- **Depends on:** ADR-0003 (where state lives: the line between a file and a row), ADR-0004 (what
  survives of the atomic document primitive after SR-4), ADR-0058 (the workspace database and its
  migration ladder), ADR-0041 (the improvement store's **export**, and the counter shape this record
  reuses), ADR-0051 (the *session* artifact store, which this record is not)
- **Requirements:** `REQ-LIBRARY-042`, `REQ-LIBRARY-043`, `REQ-LIBRARY-045`, `REQ-LIBRARY-047`,
  `REQ-LIBRARY-049`, `REQ-LIBRARY-050`, `REQ-LIBRARY-052`, `REQ-LIBRARY-053`, `REQ-LIBRARY-105`,
  `REQ-LIBRARY-158`, `REQ-LIBRARY-164`, `REQ-LIBRARY-168`, `REQ-LIBRARY-176`; `REQ-SESSION-007`,
  `REQ-SESSION-197`, `REQ-SESSION-198`; constraints **C-10** and **W-26**

## Context

`REQ-LIBRARY-042` obliges a durable, workspace-scoped store for improvement artifacts; `REQ-LIBRARY-043`
fixes what a reader and an interrupted writer may observe of it; `REQ-LIBRARY-047` makes the artifact
write all-or-nothing and the version write best-effort; `REQ-LIBRARY-049` fixes what a version carries;
`REQ-LIBRARY-052` fixes retention at 25 and forbids exposing it as a key. **No architecture record owns
any of that.**

It is worth being exact about how the gap opened, because it is not an oversight of a single pass.
ADR-0003 and ADR-0004 described this store when artifacts were files, and they described the *file/row
line* and the *atomic replacement primitive* — never this store's rules. SR-4 then moved session-owned
data into a machine-local database, which removed the file-based framing both records had reasoned from;
ESC-18 withdrew ESC-3's accepted defect as unreachable under an indivisible read-modify-write. So the two
records that mention the rule are exactly the two whose premises were removed, and **ESC-3's ruling has
had no architectural home since 2026-09-01**. ADR-0041 took the *export* in 2026-09-02 — correctly, and
only the export, because `REQ-LIBRARY-176` and `REQ-TRACE-514` were minted by one ruling over one
guarantee and splitting them would have produced two divergent implementations of it. It declined the
write path in terms. This record takes what it declined.

**The store and its service boundary were built on 2026-09-14.** The `improvement-artifacts` token of
`LIBRARY_CHANGES` (`contracts/src/library.ts`) now has a writer in the workspace service. The Library's
Proposals tab follows in the surface slice of the same delivery.

### What this record is not

The `artifacts` table that ships at schema v12 is the **session** artifact store — `REQ-LIBRARY-087` and
`REQ-LIBRARY-088`, Part Y, decided by ADR-0051. It holds one record plus an index entry per artifact,
keyed by session, with the rendered Markdown document beside the session's stored record. It has no
versions, no retention and no review decisions.

Improvement artifacts are a different store with a different lifecycle: **workspace**-scoped rather than
session-scoped (`REQ-SESSION-007`, `REQ-LIBRARY-042`), reachable after the session that produced them has
gone, mutated by review decisions long after they are written, and versioned. The two must not be
conflated, and this record exists partly so that a later reader finding one table does not assume it is
the other.

## Alternatives considered

**A — Bring the version write inside the artifact write's transaction.** One transaction, one durable
step, and the export's two figures collapse into one because a version can then only be absent by
pruning. *Rejected, and `REQ-LIBRARY-047` already forbids it in terms:* recording a version is
best-effort and "a version that cannot be recorded MUST NOT undo the artifact write it was recording".
Taking this horn would mean a workspace whose version rows cannot be written loses the ability to record
a review decision at all — the user's actual work fails to protect an audit trail about that work. That
is the wrong way round. The requirement made this choice; the record restates why rather than reopening
it.

**B — Keep the version write outside the boundary and count what was allocated.** The artifact write
records, inside its own all-or-nothing operation, that a version was **due**; the version append and its
retention pass run after, in their own operation, and count what pruning **dropped**. Two figures, two
owners, two durable operations. *Chosen.* It costs one integer written on a path that already writes, and
it is the shape `REQ-LIBRARY-047` and `REQ-LIBRARY-052` were amended into on 2026-09-02 — this record is
adopting the specification rather than designing against it.

**C — A third store, or files beside the database.** *Rejected.* SR-4 settled the medium and
`REQ-LIBRARY-158` establishes that no writer outside this application can reach a record here, which is
what let `REQ-LIBRARY-043` withdraw the staged-replacement ladder. Re-introducing files would re-introduce
the contention that ladder existed for.

## Decision

**1. Rows in the per-workspace database, at schema v18.** Schema v16 subsequently carried
PD-LIBRARY-001's command ledger and v17 carried ADR-0062's plan cycles. Three things are stored: the artifact row, its version
rows, and the two counters, which are **columns on the artifact row** rather than a table of their own so
that each is written by the transaction that owns the fact it counts.

**2. A mutation is one transaction that re-reads inside itself.** `REQ-LIBRARY-042` requires every
mutation to be a read-modify-write against what the store holds *at that moment*, taking effect as one
indivisible step. The writer re-reads the artifact row within the transaction that writes it — never from
a value a surface has been holding on screen. Two decisions recorded on different proposals of one
artifact therefore both survive always, not merely when the writes happened not to interleave; two
decisions on the *same* proposal still resolve to the later one, which is what `REQ-LIBRARY-164` promises
and no more.

**3. The version write is a second operation, and its failure is not the mutation's.** After the artifact
transaction commits, a second transaction appends the version (`REQ-LIBRARY-049`: full copy, `version`
monotonic per artifact, never re-issued, never altered) and applies `REQ-LIBRARY-052`'s retention in the
same durable step, so no reader can see a pruned count that disagrees with the versions it describes. If
that second operation fails, the save still reports success, the user's change still took effect, and the
failure appears only in the application log.

**4. Two counters, never one.** `versions_due` is incremented **inside** the artifact transaction
(`REQ-LIBRARY-047`); `versions_pruned` is incremented **inside** the append-and-retain transaction
(`REQ-LIBRARY-052`). Neither is derived from the other and neither is computed over surviving rows,
because a count taken over what remains describes what is stored rather than what was recorded. The
export reads both and carries them as two figures (`REQ-LIBRARY-176`). This is the same obligation shape,
for the same reason, that ADR-0041 consequence 8 already states for the delivery store's
transitions-ever-recorded counter — constraint **W-26** names the pair — and it is built from the same
helper so the two cannot drift apart in implementation.

**5. Two handle types, as ADR-0041 uses.** `ImprovementReader` (list, artifact, versions, counters) and
`ImprovementWriter` (save, record decision, append version, prune), the reader constructible from the
database handle and the writer from the reader plus the mutation function, never the reverse. The
workspace service is the only writer, which is where `REQ-LIBRARY-158`'s serialisation within the
application lives.

**6. What a user is told when the artifact lands and its version does not — this record's own call,
because no requirement states it.** `REQ-LIBRARY-047` puts the failure in the application log and forbids
turning it into a failed save, so **no notice is raised**: a user who successfully recorded a review
decision must not be told their action failed, and `REQ-LIBRARY-035`(d) keeps such failures out of the
run's result. But the absence is now *countable*, and `REQ-LIBRARY-168` already draws a history surface
listing retained versions newest-first. **That surface states the count of versions never recorded beside
the versions it lists**, in text, without offering to recover them — there is nothing to recover, because
this obligation records that a version is missing and never the version. Silence there would make the
history read as complete when the store knows it is not, which is the exact falsehood `REQ-LIBRARY-176`
was minted to prevent in the export; the surface a person actually opens should not be the one place that
falsehood survives.

**7. A write bumps the library revision through the declared token.** `improvement-artifacts` in
`LIBRARY_CHANGES` (`REQ-LIBRARY-105`) is bumped by the artifact transaction, not by the version
operation: the version is an audit of a change, not a further change.

## Consequences

1. **The Library's Proposals tab becomes buildable.** It was blocked on this record's absence and on
   nothing else in the architecture.
2. **ESC-3's ruling has an architectural home again**, and the indivisible read-modify-write that made
   its defect unreachable is stated somewhere a reader can find from the store rather than only from the
   requirement that withdrew it.
3. **The export stops depending on an unwritten store.** ADR-0041 owns `REQ-LIBRARY-176` and names the
   fix; the two figures it must carry are now produced by a path that exists on paper and can be built.
4. **One migration landed** (v18) and one integer is paid on every artifact write, for a figure most
   users never look at. Constraint W-26 exists to keep that cost alive in the record rather than have an
   implementer find two unexplained counters and delete them.
5. **A first execution will report back here**, including if it finds nothing — standing policy. Every
   mechanism in this record's corpus that has gone from paper to first execution has held a defect no
   reading caught, and a store with two counters written by two different transactions is exactly the
   shape where a reading is likely to be wrong about ordering.

## First execution — 2026-09-14

The v18 migration, contracts, reader/writer capability split, workspace-service command, immutable run
type, legacy import and the two-operation version path were first executed through thirteen focused tests.
The tests drove two writable connections against one store, a forced history-write failure, thirty
mutations through retention, a pre-history row, a malformed legacy file and a close/reopen. The artifact
transaction remained committed when the version operation failed; `versions_never_recorded` read 1,
the warning named the failure, and a stale compare-and-set write was refused. Retention kept version 1
and the newest 24 and counted six pruned versions. **The execution found no defect in this mechanism.**

## Revisit if

`REQ-LIBRARY-052`'s N stops being fixed at 25 by the document, which would make retention configurable
and give the pruned counter a moving denominator; or a requirement asks that a recorded version be
**restorable**, which `REQ-LIBRARY-168` currently forbids and which would turn the version rows from an
audit trail into a second write path; or a writer outside this application is ever admitted to the store,
which `REQ-LIBRARY-158` presently excludes and which would bring back the contention ADR-0004's retry
ladder existed for; or the session and improvement stores are asked to share a table, which this record
argues against in "What this record is not".
