# Architecture proposals — DATA slice — ADR-DATA-02 — One document-store primitive, with a guarded read side

Part 15 of 25 of [the data proposal](../data.md), which indexes every part.

## ADR-DATA-02 — One document-store primitive, with a guarded read side

### Decision to be made

How the dozen-odd stores in this slice perform their reads and writes: one shared primitive, one per
store, or ad-hoc code at each call site. And what the read side must do, given Spike 1.

### Constraints that bear on it

- **B1** (atomic replacement, stated independently eleven times), **B2** (temp file in the target's
  own parent directory), **B3** (no leftover temp; never mistakable for a record; fixed prefix for
  the prompts file), **B4** (5 attempts, two conflicting schedules), **B5** (mode `0644` for the
  `agents.yaml` writers and the snapshot, but *not* stated for `secrets.yaml`), **B7** (some writes
  best-effort by requirement), **C1** (read-modify-write immediately before writing, no locking).
- `REQ-LIBRARY-043`'s exact words: a concurrent read returns the complete previous or the complete
  new file, "never a partial, **empty**, or unparseable file".
- Spike 1: with Node's ordinary read and write APIs on Windows, a concurrent reader observes an empty
  file roughly once in 2,000–16,000 reads under contention, and an ordinary open reader makes the
  writer's `rename` fail with `EPERM`.

### Alternative A — one primitive, uniform policy

A single `writeDocumentAtomically(path, bytes)` and `readDocument(path)` used everywhere, with
identical retry, mode and temp-naming behaviour.

Simple; one place to audit and one place to fix a filesystem bug. But it cannot be uniform without
being wrong somewhere. **B4**'s two retry schedules differ (1 s total versus 1.55 s);
`REQ-CONFIG-216` gives `secrets.yaml` no mode while `REQ-CONFIG-444` gives `agents.yaml` `0644`; the
prompts file has a fixed temp prefix (`REQ-LIBRARY-138`) while the improvement store only requires
that temps not be mistakable for artifacts by its own listing rule; and `REQ-LIBRARY-047` needs the
history write best-effort while the artifact write is all-or-nothing. A uniform primitive would
either over-constrain some stores or under-constrain others, and the over-constrained cases fail
conformance quietly.

### Alternative B — a primitive with an explicit per-store policy, and store-specific readers

One implementation of the write mechanism; a small declarative policy per store naming the
temp-naming scheme, the retry schedule, the file mode, and whether failure is fatal or best-effort.
Each store owns its own decode-and-validate step, because each has a different notion of a valid
document and a different error text: `REQ-LIBRARY-014`'s `malformed improvement artifact: ` prefix,
`REQ-CONFIG-018`'s parser detail including line and column, `REQ-TRACE-117`'s `<path>:<line>: `
malformed-baseline form.

More moving parts than A, but every difference it carries is a difference the specification fixes.

### Alternative C — a third-party atomic-write package

`write-file-atomic` and its relatives handle the tmp-and-rename dance including Windows retries, and
would be a reasonable choice if the requirements were generic. They are not. **B3**'s "never named so
that the id listing could mistake it for an artifact" is a constraint on the temp *name* that must
agree with `REQ-LIBRARY-045`'s listing rule. **B4**'s bound is "all 5 attempts MUST complete within 1
second of the first", a property of whichever schedule the package chose. And no package addresses
the read side at all, which Spike 1 shows is where the requirement actually breaks. We would end up
wrapping it until it was doing only the `rename` call, while adding a dependency to the most
security-relevant write path in the product (`secrets.yaml`).

### Recommendation

**Alternative B**, with an addition Spike 1 makes non-optional: **the read side is part of the
primitive, and it retries.**

Write side: stage into the target's own parent directory under a name the store's own listing rule
cannot mistake for a record; write; replace; on `EPERM`/`EBUSY`/`EACCES` retry on the store's
declared schedule; remove the staged file on every failure path; apply the store's declared mode.

Read side: read, and if the result is empty or fails the store's own decode *while the file is known
to exist*, retry on the same schedule before reporting the condition. Without this, Spike 1 shows we
fail `REQ-LIBRARY-043` on Windows at a rate that will present as a flaky bug rather than as the
design error it is. The guard is safe because none of these stores has a legitimately empty
document: `REQ-LIBRARY-014` requires a schema-valid artifact and `REQ-CONFIG-019` requires a mapping
at the top level.

The guard must **not** apply where empty is a legal state and is specified as such: a missing
configuration file yields an empty mapping and is not an error (`REQ-CONFIG-016`), and a file that is
empty, whitespace-only or comment-only parses to nothing and is "indistinguishable from a missing
file for load purposes" (`REQ-CONFIG-017`). Absent and empty are deliberately conflated there. So the
guard keys on *decode failure after a successful stat*, not on emptiness alone.

Two further rules follow from Spike 1 and belong in the primitive:

- **Readers must not hold descriptors.** An open reader makes a concurrent writer's `rename` fail
  with `EPERM`. Every read of a store file is open-read-close within one call. Anything that wants to
  *follow* a file — the event journal's resumable reader in domain 20 — must open per poll rather
  than hold a handle. That is a constraint this slice imposes on a neighbouring one and it should be
  carried into synthesis.
- **Durability is bounded by what the platform offers.** Directory `fsync` is unavailable on Windows
  through Node. `REQ-LIBRARY-138` asks for the prompts file to be "flushed to disk" and no other
  requirement in this slice asks for `fsync` at all; every crash-safety requirement I own is phrased
  either as an *ordering* (**B6**) or as *the replace is atomic* (**B1**), both of which `rename`
  provides. See **OQ-4**.

### Consequences accepted

- A read can cost two attempts under contention. The added latency is bounded by the store's retry
  schedule and is zero in the uncontended case.
- **B4**'s two schedules become two policy values rather than one constant. The conflict is contained
  rather than resolved (**OQ-3**).
- We own the filesystem edge cases — antivirus handles, network shares, case-insensitive collisions —
  rather than delegating them.

### What would have to change to revisit this

A requirement that a store file may legitimately be empty and must be read as empty without a retry;
or a Node API exposing `FILE_SHARE_DELETE` on open, which would let readers hold handles safely and
would remove the "no descriptors held" rule.

---
