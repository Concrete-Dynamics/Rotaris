# ADR-0058 — history

The passages of [ADR-0058](../../../architecture/adr/0058-the-workspace-database.md) that are history rather than decision — the explanations of its revisions, its corrections and its struck text — each moved here verbatim, under its own anchor, by `pnpm archive:migrate` (`tools/archive/adr-history.mjs`); the record keeps one line for each, where it stood. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="revision-2026-09-02"></a>

**The revision of 2026-09-02**, from [0058-the-workspace-database.md](../../../architecture/adr/0058-the-workspace-database.md), the header:

**Every decision this record had
taken survives. Four of the reasons it gave for them do not**, and each is corrected in place rather than
quietly rewritten, because a decision resting on a falsified reason is a decision the next reader
simplifies away. The four: that write-ahead logging is unsupported on network filesystems; that the store
therefore opens read-only; that reading the journal-mode pragma back is a sufficient guard; and that the
strongest durability setting is what makes a terminal status readable by another process. One new hazard
is recorded that no version of this record considered — a store reached through two path spellings — and
ESC-26's confirmed-establishment path is built.

<a id="revision-2026-09-02-2"></a>

**The revision of 2026-09-02**, from [0058-the-workspace-database.md](../../../architecture/adr/0058-the-workspace-database.md), the header:

**Every decision the restore section takes survives. Three defects
in its mechanism do not, and each is corrected in place below with the measurement that found it**, because
all three are the kind a later simplification would put back. The three: the staging store was opened and
no step closed it, so the install rename could not run at all (0 of 30); the live-session gate was
evaluated before the run host was told to refuse runs and nothing re-checked, which destroyed a live
session and every row it had written; and the reversal was a single rename onto a name whose occupancy is
the commonest reason the step it reverses had just failed. Consequence 17 records what three such findings
in a row imply about the parts of this record nobody has run.

<a id="revision-2026-09-02-3"></a>

**The revision of 2026-09-02**, from [0058-the-workspace-database.md](../../../architecture/adr/0058-the-workspace-database.md), the header:

**D3** the unbounded close handshake: bounded at 2,000 ms with **expiry taking the abandonment
path**, since an unanswered close is indistinguishable from a run host still writing, and step 1's refusal
made a **lease the run host expires itself**, because the measured dual failure leaves no workspace service
alive to release it. **D6** the displaced-store stamp: milliseconds, claimed by an exclusive create with a
counter on collision — granularity is not uniqueness. **D7** the container layout becoming the store
layout: the conversion is now a step rather than an assumption, and `origin.txt` is written by the restore,
having been absent from every restored store. **None of the three corrections has been run**; that is IC-1
in `../../../architecture/implementation-conditions.md`, and consequence 17 is why it exists.
