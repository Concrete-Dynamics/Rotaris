# ADR-0024 — Evidence and audit as append-only tables behind one writer, what the audit's export must prove, and which record may never be exported — Consequences accepted

Part 4 of 9 of [ADR-0024](../0024-evidence-and-audit-files.md), which indexes every part.

## Consequences accepted

1. **Retention is O(1) per entry and runs inside the entry's transaction**, so it no longer needs to be
   kept off a latency-budgeted path. The previous consequence — compaction is O(file) and must not sit
   on such a path — is withdrawn with the compaction. Under ADR-0002 the writer is still in the run
   host, off every interface thread.
2. **The 5000-entry cap is per kind, not per session-day, so a long session loses its early history.**
   That is specified (`REQ-TOOLS-078`, `REQ-TOOLS-190`, `REQ-SESSION-133`), and it must be visible to
   whoever builds a diagnostics view or reads an export, or a truncated history is presented as a
   complete one. `REQ-SESSION-199` closes that for the exported audit by requiring the drop count to be
   stated; the same obligation must reach any in-application rendering.
3. `REQ-TOOLS-080`'s "a decision taken outside every registered session writes no entry and reports no
   error" means the writer must be **absent**, not failing, in that case — the code path is a no-op, not
   a swallowed error.
4. **Terminal-input entries cross a process boundary before being written**, so they are ordered against
   permission decisions by arrival at the writer's queue. `REQ-TOOLS-078` orders entries by the order the
   decisions were taken; for user input there is no competing definition, and arrival order is the honest
   one. A reader of the export sees them in one ordinal series with the decisions, which is what
   `REQ-SHELL-107` intends.
5. **The audit shares a corruption domain with every other session in the workspace.** Under files a
   damaged audit cost one session's; a damaged workspace store costs every session's. For a security
   record that is worth stating plainly rather than leaving to SR-4's general note. The bound is that the
   database is scoped per workspace; there is no per-session bound left. **The export is the only *readable*
   copy a user can hold outside that domain**, and under `REQ-SESSION-198`'s machine-local store neither the
   audit nor any other record travels with a backup of the workspace — `REQ-SESSION-200` now names the audit
   explicitly among what sits outside such a backup, and obliges the product to state that rather than let a
   user infer it. **SR-9(b)'s gap has since been answered twice over and the second answer changes this
   consequence**: `REQ-SESSION-201` mints a whole-store backup, so carrying the audit off the machine no
   longer depends on the export. That makes the export's availability a **transparency** property again
   rather than also a durability one — which is the right division, since `REQ-SESSION-201` says in terms
   that the two artifacts do not substitute for each other and that neither may be offered as the other.
   The audit is unusual in needing both: the backup is how it survives the loss of a machine, the export is
   how it is checked by someone who does not trust us.
6. **The "a human can no longer read it" gap is closed, and the line left open is now drawn by one test
   applied once rather than case by case.** The previous version of this record reported the opposite and
   is superseded on every point of it: it said the verification-gate record had no export and that this
   "sits against SR-6's own reasoning"; it said SR-9(a)'s two exports "have not landed"; and it said the
   export list "is being drawn case by case against one argument rather than by applying the argument
   once". **All three have been overtaken.** `REQ-TOOLS-190` grants the verification-gate record an export
   and states the general test; `REQ-LIBRARY-176` and `REQ-TRACE-514` mint SR-9(a)'s two; and the test is
   now stated once, in one requirement, with `REQ-EVENTS-163` narrowed to stop reading as a second grant.
   The concern was correct and it has been answered by amendment — recorded that way rather than deleted,
   because the pattern is worth keeping: what looked like an inconsistent list was a missing rule.
   - What exports: the event history's two forms (`REQ-EVENTS-166`), the timeline, the issues record, the
     metrics document and the permission audit (`REQ-SESSION-199`), the verification-gate record
     (`REQ-TOOLS-190`), the improvement store (`REQ-LIBRARY-176`) and the delivery store
     (`REQ-TRACE-514`). `REQ-SESSION-191` keeps the file-manager reveal for the log, the summary and the
     artifact bodies (`REQ-SESSION-002`).
   - What does not, and why it is a property rather than a policy: `REQ-SESSION-136`'s tool-call evidence,
     absolutely and permanently, because it holds the arguments an agent passed exactly as they were
     passed; and the remaining ring-capped kinds of `REQ-SESSION-133` — model inputs, context selections,
     report validations, memory snapshots — which have not been put to the test and would be settled "by
     applying the test above to that record's own content, and never by arguing from this list"
     (`REQ-TOOLS-190`).
   - **Two of those four are worth naming as likely to fail the test rather than pass it**, so that a later
     reader does not treat the residue as an oversight to tidy up: a model-input record is by definition the
     text sent to a model, and a memory snapshot is workspace content. Neither is this record's to decide
     and neither is decided here.
7. **This record has no remaining position on where these records live on disk, and that is the point.**
   `REQ-TOOLS-078` and `REQ-TOOLS-190` have both been amended to fix no path, file name or directory, so
   the coupling between this record's design and a layout is gone in the specification and not only in
   the architecture.
