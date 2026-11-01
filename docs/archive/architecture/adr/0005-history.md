# ADR-0005 — history

The passages of [ADR-0005](../../../architecture/adr/0005-the-session-lock-as-capability-token.md) that are history rather than decision — the explanations of its revisions, its corrections and its struck text — each moved here verbatim, under its own anchor, by `pnpm archive:migrate` (`tools/archive/adr-history.mjs`); the record keeps one line for each, where it stood. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="revision-2026-09-02"></a>

**The revision of 2026-09-02**, from [0005-the-session-lock-as-capability-token.md](../../../architecture/adr/0005-the-session-lock-as-capability-token.md), the header:

`REQ-GIT-128` and `REQ-GIT-124` have since been amended and
they now decide what this record previously described as an unconnected hazard; the paragraph that said
"no requirement currently connects the two" is **withdrawn and must not be cited**.

<a id="revision-2026-09-02-2"></a>

**The revision of 2026-09-02**, from [0005-the-session-lock-as-capability-token.md](../../../architecture/adr/0005-the-session-lock-as-capability-token.md), the header:

**Consequence 11's lock-row correction has been run, with its
counterfactual, and is confirmed.** The consequence now states what was measured instead of predicting
what would happen, and its subjunctive is retired. Nothing else in this record changes and no decision in
it moves.

<a id="correction-2026-09-29"></a>

**The correction of 2026-09-29**, from [0005-the-session-lock-as-capability-token/10-first-execution-2026-09-05-the-lock-re-claimed.md](../../../architecture/adr/0005-the-session-lock-as-capability-token/10-first-execution-2026-09-05-the-lock-re-claimed.md), “First execution — 2026-09-05, the lock re-claimed on resume, and the one reap”:

*Corrected 2026-09-29 (R-067): "held through the continued run" was true of the **first** continue after a load only.
That teardown released the lock while the session stayed loaded in the same process, and no later continue there took it
back — `prompt`'s re-claim went through `resume`, which returns at once for a session already live, and the Continue
action and the plan decision claimed nothing — so every run after a process's first ran with no lock row. The claim is
kept as it was measured; what the later continue does now is the section "the lock a continue takes back" below.*

<a id="correction-2026-09-29-2"></a>

**The correction of 2026-09-29**, from [0005-the-session-lock-as-capability-token/11-first-execution-2026-09-06-the-explicit-repair.md](../../../architecture/adr/0005-the-session-lock-as-capability-token/11-first-execution-2026-09-06-the-explicit-repair.md), “First execution — 2026-09-06, the explicit repair on demand (Part U)”:

*Corrected 2026-09-29 (R-067, acceptance finding A14): "the writer releases the lock last" and "an entry written after
the release would be a row written without the lock" held for a session **not** loaded in the process that repairs it,
whose writer `withWriter` opens (claiming the lock) for the call. For a session loaded here the unit wrote through the
live writer and never looked at the lock, which the run's teardown had already released, so the status, the entry and
the crash record were written with no lock row at all, and the safety checkpoint and the restore's outcome
(`recordSafetyCheckpoint`, `recordRestore`) the same way. The reading is kept as it was taken; the section "a write
through a loaded session outside a run" below is what the loaded branch does now.*
