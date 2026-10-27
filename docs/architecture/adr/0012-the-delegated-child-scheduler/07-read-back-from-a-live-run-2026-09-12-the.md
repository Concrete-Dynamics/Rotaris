# ADR-0012 — The delegated-child scheduler: a persisted ledger, not a promise graph — Read back from a live run — 2026-09-12: the report's commands and edited files

Part 7 of 14 of [ADR-0012](../0012-the-delegated-child-scheduler.md), which indexes every part.

## Read back from a live run — 2026-09-12: the report's commands and edited files

*This record's Consequences claim "the report's bounded pass with its `summary_failure` fallback" as part of
what it decided, so the defect reports back here. The report's FIELD SCHEMA is not this record's: it is fixed
by `REQ-ORCH-108`..`REQ-ORCH-112` and the specification's "Child report artifact (behavioral schema)", and no
architecture record decides it.*

**Measured.** After a 22-minute run: the child `Create-Architecture-Documentation-Files` wrote five files and
ran eight terminal commands, and reported `edited_files: []` and `commands: []`. The child
`Design-Domain-Model` reported `edited_files: ["Memory: domain-design/core-domain (comprehensive domain model
specification)"]` — a sentence the summarising model composed, where the schema asks for paths.

**Found.** `children/report.ts` hardcoded `commands: []` at all three construction sites — the fallback, the
deterministic tester path and the shaped report — so a field the schema requires was populated nowhere in the
product. `edited_files` was whatever list the summarising model happened to write, and nothing checked it
against what the child had done.

**The falsified reason, kept beside its replacement.** The bounded pass was built on the reading that the
report is the SUMMARISER's account of the child, so every field of it is the model's to fill. That is right
for the summary, the findings, the next actions and the tags, and wrong for the two fields that are facts of
the transcript. It also fails exactly where the report matters most: `REQ-ORCH-110` requires a report even
when the summarising pass FAILED, and a field that only a successful model can fill is empty precisely then.
Restated: **what the child ran and what it wrote are derived from the transcript, not asked of a model.**

**Built.** Two pure functions in `children/report.ts`, applied at all three sites. `commandsFrom` takes the
command from each `terminal` tool-call's own arguments and the exit code from the `[terminal_diagnostic]`
block (`REQ-TOOLS-100`) of the result that answered it, matched by `callId` — null when the block carries
none, which is how `REQ-TOOLS-100` represents a background start or a refused request, and why the field is
nullable. `editedFilesFrom` takes the path of every `write_file`, `haet_edit` and `haet` call under either
argument name the file tools accept, and UNIONS the summariser's own list after it, so a genuine mention it
made survives while an invented one can no longer be the only thing the field holds. No new plumbing: the
call site already derived `toolsUsed` from the same messages.

*Corrected 2026-09-30 under [R-067](../../../product/requests.md#r-067), the claim above kept as it was built:* "the
path of every … call" listed a write whatever answered it. A write a sibling's claim refused (`PD-TOOLS-006`), one
the permission gate or a pre-tool hook refused, or a `haet_edit` whose find text matched nothing changed nothing,
and still reached `edited_files`, the fallback's "Files touched" and, since OQ-111, the facts the pass is told never
to deny. `editedFilesFrom` now skips a write call the record answers as refused, and the summariser's own list cannot
name a path whose every write was so answered
([`a-reports-edited-files-counts-refused-writes`](../../../defects/fixed/a-reports-edited-files-counts-refused-writes.md)).
A call no result answers — which the turn never leaves — is still listed. *Falsified by the repair's verification and
kept beside its correction:* this correction first said a write call answered with any error (`isError`) was skipped,
which took a call a rest, a stop or a crash cut off for a refusal. A call that was under way when it was cut off is
answered with an error even when its write had landed (the turn cuts a dispatch that returned `ok` after the pause's
tool deadline), so a call whose result is the `ran` statement of `interruptedResult` (`ranBeforeItWasCut`) is still
listed; only a call cut before it started, or whose approval was withdrawn, is skipped with the refusals.

**The bound, stated rather than hidden.** A context compression REPLACES the conversation
(`REQ-MONITOR-084`), so a child compressed mid-task no longer carries its earliest tool calls in the
transcript the report is built from, and the derived lists are of what survives there. The durable
tool-call record (`REQ-SESSION-133`) would not have that bound; reaching it is new plumbing and was not
taken here.

**Still not built from the schema:** detail payload, created files, artifacts, tests, escalation signal.
`commands` now has a value and no surface reads it yet.
