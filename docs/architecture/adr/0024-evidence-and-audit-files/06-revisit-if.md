# ADR-0024 — Evidence and audit as append-only tables behind one writer, what the audit's export must prove, and which record may never be exported — Revisit if

Part 6 of 9 of [ADR-0024](../0024-evidence-and-audit-files.md), which indexes every part.

## Revisit if

A requirement adds a query over the audit that the stored-entry-plus-columns shape cannot serve without
decomposing the entry, which would reopen alternative B and would need the tamper-evidence question
answered explicitly rather than by default. Or a consumer outside this product is given a contract over
the audit, which would put a byte format back on the **write** path and reopen alternative A — note that
`REQ-SESSION-199`'s export deliberately does not do this, because it is a file a user asks for and never
an interface anything is built on. Or a requirement asks the audit's integrity to be provable against
someone who has the store, which is a different problem from the one this record solves and would need a
mechanism no ruling has yet authorised.

**Or one of `REQ-SESSION-133`'s remaining ring kinds passes `REQ-TOOLS-190`'s redaction-safety test**, in
which case it uses the five mechanisms above and this record needs no new decision, only an exporter of its
own — deliberately not a flag on a shared one (alternative D). The previous version listed the
verification-gate record here; that trigger has fired and is now discharged in the decision.

**What would NOT reopen the boundary, named because it is what a reopening would look like.** A user asking
for the tool-call evidence; a support workflow that would be easier with it; a redaction pass proposed for
it, since `REQ-SESSION-136` keeps the arguments unredacted deliberately and a redacted copy is not that
record; or an argument from `REQ-SESSION-201` that unredacted content already leaves in the backup.
`REQ-TOOLS-190` disposes of the class: a proposal to export that record "is in conflict with this one and
MUST be refused rather than reconciled". This record has nothing to add to that and adds nothing.

**Two dependencies of this record's export design. One is now partly measured; the other is not.**

**(a) The export taken during a busy run — measured in direction, and the expectation this record stated
was too strong.** The previous text read: *"a 5,000-entry read is a read, so under write-ahead logging it
should not delay the writer at all, which `REQ-EVENTS-098` requires of the store as a conformance
property."* `../spikes/commit-on-the-publish-path.md` §8 measured a second OS process reading this store
while the run host committed: a reader doing whole-session reads back to back — **147–1,603 ms per pass,
47,695–82,405 rows over the run** — **never blocked the writer** (zero errors, zero `SQLITE_BUSY`) but took
its commit from **p50 163.6 → 345.9 µs and p95 271.7 → 898.9 µs**.

So **the conclusion holds and the wording does not**: a read does not block the writer, which is what
`REQ-EVENTS-098` forbids on the reading its own following sentence fixes — *"a store in which one blocks
the other does not satisfy this requirement"* — but "does not delay the writer at all" is measurably false
and should never have been written. ADR-0009 consequence 12 carries that reading; this record adopts it
rather than restating it. **The conditional in the previous text — "if an export is shown to delay a
writer, the fix is in the store" — must not be triggered by the doubled median above**, or the store gets
blamed for a property no store has.

What is *not* measured: the reader in the spike was a whole-session transcript read rather than an audit
export, it read continuously rather than once, and a single 5,000-entry read is smaller than any pass it
took. The **direction** is established; the specific number for this export is not.

**And one sharp thing the same section establishes, which mechanism 5 leaves ambiguous.** Mechanism 5 says
the export's read "runs in one transaction". **It must be a read transaction and never a write one.** The
spike measured what happens when a second process holds a *write* transaction against this store — which
ADR-0058 rule 4 forbids — and it is not a matter of degree: a 200 ms hold produced a single writer commit
of **205.4 ms**, 82 % of `REQ-MONITOR-222`'s entire budget, and a run with no gaps between holds starved
the writer indefinitely. "One transaction, for consistency" is exactly the phrase under which someone
writes `BEGIN IMMEDIATE`. **The distance between the right reading and the wrong one is 346 µs against
205 ms**, and it is stated here rather than left to rule 4 to catch.

**(b) Whether the export's document form is tolerable at the caps `REQ-SESSION-133` sets is still not
measured**, and the commit spike does not touch it. Unchanged.
