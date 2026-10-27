# ADR-0024 — Evidence and audit as append-only tables behind one writer, what the audit's export must prove, and which record may never be exported — Alternatives considered

Part 2 of 9 of [ADR-0024](../0024-evidence-and-audit-files.md), which indexes every part.

## Alternatives considered

**A — Keep the line-delimited files.** *This record's own previous decision, preserved as the
alternative it now is.* Its case was `REQ-TOOLS-078` fixing the audit as a workspace-observable artifact
at a fixed path with byte-level properties, and the objection that a database would either be a cache
for a file that is already the contract, or would not exist between reads.

SR-4 reverses the premise the first half rested on — nothing outside this product reads the audit, so
"workspace-observable artifact" was a property of the reference product's shape rather than of a
consumer this product has — and `REQ-TOOLS-078` has since been amended to stop fixing a location at all.
SR-6 answers the second half without reinstating the file: the user gets a document, on demand, that
carries the record's properties with it.

**What the file cost is now measured rather than asserted**, and the measurement is cited as **history**
— it documents the design SR-4 replaced, not a rule to carry forward.
`../spikes/windows-writer-handle-compaction.md` shows that a compaction which renames a staged file over
a target the writer holds open for append fails on **200/200 attempts** with `EPERM`, and that the
blocker is the replace-by-rename mechanism rather than the open's share mode (§3.1, §3.2). That result
applies to these records by construction, because they used the same compaction mechanism. The
consequence is worse here than for the event history, and specifically because of a requirement in this
record's own context: every write on this path is best-effort with respect to the caller
(`REQ-TOOLS-027`, `REQ-TOOLS-076`), so **a failing compaction is silent by construction** — the ring
would never trim and the record would grow without limit behind a repeating warning while dispatch
carried on undisturbed. That was consequence 5 of the previous record and it remains the strongest
single argument against the file.

**Two honesty notes about that evidence.** The spike states in terms that it did **not** exercise
`permissions.jsonl` or `verification-gate.jsonl` separately and that this record must not cite its
21.5 ms and 29.8 ms compaction figures as if it had (§6, §8). It does not. And the spike raised a
conformance question it could not settle: `REQ-EVENTS-091` explicitly tolerates a failed trim, while
`REQ-TOOLS-078` states the ring as an invariant with no such clause, so a failed compaction left the
audit over its cap with no requirement authorising that state. **That question is closed by the store
change and by the amendment together** — see the retention section — and it is recorded here so that the
closure is visible rather than the question simply disappearing.

**B — Rows of typed columns, with no stored serialised entry.** The obvious relational shape and the
cheapest. Rejected for the audit specifically. `REQ-TOOLS-078` promises every retained entry "exactly as
it was recorded — every field, adding nothing and dropping nothing", and while that clause exists to
promise *immutability* rather than a byte contract with an outside consumer, `REQ-SESSION-199` now
requires the export to carry that property to a reader who does not trust us. Typed columns alone would
make "never altered" a claim about our code rather than about what is stored, and would make the
exported entry a re-serialisation of a decoded copy — the shape `REQ-EVENTS-104` forbids for the event
history for exactly this reason.

**C — One evidence table with a kind discriminator.** Fewer objects, one ring implementation. Rejected:
`REQ-SESSION-133` fixes **seven** caps and `REQ-TOOLS-078` and `REQ-TOOLS-190` two more, so the ring
would need a per-kind window over a shared table on every insert, which is more work and more subtle
than a per-kind ordinal. The field sets differ too — `REQ-TOOLS-079`'s eleven fields,
`REQ-TOOLS-082`'s mode-change shape, `REQ-TOOLS-190`'s nine — so a shared table would be a shared
payload column with nothing shared above it.

**D — One exporter over every evidence kind, driven by a per-kind policy row carrying an `exportable`
flag.** The natural shape once several kinds export, and the one a later simplification will propose,
because it is genuinely better on every axis except the one that matters. One code path, one document
envelope, one place to fix a bug, and adding a kind's export is a data change rather than a code change.
**Rejected, and rejected on the security property rather than on cost.**

Under it, the entire distance between "the audit, whose entries carry no argument values" and "the
tool-call evidence, which holds the arguments an agent passed exactly as they were passed" is one boolean
in a table. `REQ-TOOLS-190` does not merely decline that export; it says such a proposal "MUST be refused
rather than reconciled". A design in which refusing it means noticing a `false` has been changed to a
`true` — in a data row, by anyone, at any time, with the diff reading as configuration — is a design that
has moved a MUST-NEVER into the place least likely to be read carefully. The field's live hazard is on
record and is not hypothetical: Codex rollouts are documented as carrying "prompts, command output, file
paths, code, and accidental secrets", and opencode ships a `--sanitize` flag because of it (ESC-20).

The cost of rejecting it is real and is accepted: the ring logic, the ordinal discipline and the document
envelope are still written once and shared, but **the export path is not**, so a bug fixed in one exporter
is not automatically fixed in another. That is the trade — a little duplication on a path that produces
files a user asked for, against a boundary that cannot be crossed by editing a value.

**E — One append-only table per evidence kind, holding both the serialised entry and the columns a
query needs, behind one serialised writer per session, with the ring's own state exported beside the
entries, and with export reachability a structural property rather than a flag.** Chosen.
