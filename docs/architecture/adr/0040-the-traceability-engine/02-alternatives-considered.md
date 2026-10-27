# ADR-0040 — The traceability engine is a stateless streaming library over files, with a single I/O owner — Alternatives considered

Part 2 of 8 of [ADR-0040](../0040-the-traceability-engine.md), which indexes every part.

## Alternatives considered

**A — Parse the store into a resident model and refresh it incrementally**, watching the filesystem.
This is the design most boards get, and it would make the N-scans cost disappear. `REQ-TRACE-089`
forbids it in the plainest language in the domain, and `REQ-TRACE-203` makes incremental reading an
*optional source capability* rather than the engine's behaviour. What survives of A is the
**within-invocation** reuse the same requirement's last sentence permits and `REQ-TRACE-202` invites —
prose reads keyed to the store's own content hash, so an unchanged document's text is not fetched twice
within one refresh.

**B — A stateless engine invoked per operation, streaming its parse.** Chosen. Within one invocation,
values are shared freely — `REQ-TRACE-091` requires one reading of each to serve every check and
`REQ-TRACE-128` says how much of the work the invocation repeats shall not be observable. Between
invocations, nothing is retained.

**C — Move the parsed store into the workspace database as a second definition of the requirement set.**
The obvious thing to try once a database exists, and still refused. *Against, and each is independently
sufficient:* the requirement documents are **the project's own Markdown under the project's version
control**, written back "into the original artifact — the project's own file, never a local copy"
(`REQ-TRACE-434`), and `REQ-TRACE-513` now forbids the move outright rather than leaving it to a
principle. A parsed copy in rows that anything reads *as the requirement set* is a **second definition
of it**, which `REQ-TRACE-197` forbids in terms — "any additional frontmatter reader would amount to a
rival definition of the repository's requirement set, and the two definitions would diverge as soon as
the document format changed."

> **What this record used to say here, and why one third of it is now wrong.** The previous version
> listed a fourth objection: "detecting the index's staleness cheaply requires consulting exactly the
> **stored summary `REQ-TRACE-089` forbids consulting**", and concluded that C "fails on four separate
> stated observables". It also read `REQ-TRACE-152` as leaving "nowhere an index could legally live",
> and `REQ-TRACE-090`/`REQ-TRACE-408` as forbidding the index's own maintenance write.
>
> **The argument was sound and its premise has been removed.** `REQ-TRACE-089` now says an index is
> permitted and says exactly what makes one admissible. Read against the amendment, the old objection
> proves something narrower and still true: an index cannot be validated *cheaply*. The requirement
> agrees — it requires the check to be "against the files themselves", names a restored backup and a
> checkout of another revision as changes "the application has no way to observe", and thereby rules out
> every cheap validator anyone would reach for first. A modification time is not a validator, because a
> restore can preserve one. A size is not a validator. A file-system watcher is not a validator, because
> the requirement's test is that the change may arrive by means the application cannot observe. What
> survives as an argument is a **cost** statement, not a prohibition, and it is carried into alternative
> E where it belongs.
>
> `REQ-TRACE-152`'s "nowhere an index could legally live" was a misreading. Its subject is what the
> toolchain writes **into the repository**; `REQ-TRACE-513` confirms that framing by naming exactly the
> repository artifacts and then permitting an index elsewhere. The `REQ-TRACE-090`/`REQ-TRACE-408`
> objection is *not* fully answered and is carried into alternative E as a live tension rather than
> resolved here.

**E — A validated index, on `REQ-TRACE-089`'s terms.** *Newly available, and not adopted now.* Distinct
from C in the only way that matters: nothing ever reads the index **as an answer**. It is offered a
freshly-read file and either recognises it or does not, and what it saves is interpretation — frontmatter
parsing, prose extraction, derived-from closure, and above all the project-supplied regular-expression
matching of `REQ-TRACE-073`, which is the one phase of the sweep that no requirement bounds
(`REQ-TRACE-154`, consequence 4). What it cannot save is **reading**, because every admissible validator
is over content. This record fixes E's shape so that it cannot be built wrongly later, and declines to
build it now (see specific 7 and *Revisit if*): `REQ-TRACE-088` and `REQ-TRACE-501` are the budgets, no
measurement says they are missed, and an accelerator adopted before its need is demonstrated is an
accelerator whose correctness nobody is motivated to keep.

**D — Keep the artifacts as files but hold a coordination record for them in the database.** A lock in
a table is still a lock: `REQ-TRACE-502`'s opening clause refuses "any lock, lease or coordination
file", and a row is a coordination record whatever it is stored in. It would also make the toolchain
undeployable in a project's test session, which has no workspace database. `REQ-TRACE-513` adds a second
refusal that is independent of the first: "no property of a store's concurrency control may be cited as
discharging" `REQ-TRACE-502`. Refused.
