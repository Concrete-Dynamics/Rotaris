# ADR-0055 — Startup sequencing, the instance claim, and the first-paint budget — Discharged — the two clauses that fired, retired 2026-09-02

Part 8 of 17 of [ADR-0055](../0055-startup-sequencing.md), which indexes every part.

## Discharged — the two clauses that fired, retired 2026-09-02

**The steady-state clause fired the good way.** It read: *"the portable's steady state is asserted to
resemble [the installed flavour] on the strength of a 0.7-second file-copy baseline, which is a baseline
and not a result."* It is now a result and the assertion held: 575.5–1,414.6 ms across every cached
measurement, 0.58–1.41 s consumed against the installed flavour's 0.6–1.6 s. None of the three bad
outcomes the clause was written for occurred. The prepared launch reached first paint with about 3.6–4.4 s
to spare, so the **font await** the clause named as the first thing this record would give up is not under
pressure and stays. The fast-path check is well under a millisecond of it, so consequence 11's marker
chain does not have to change — **and it must not, because ADR-0054 has since made that marker carry the
completeness manifest as well; shrinking it now would trade this record's warning chain and that record's
damage check for a saving the budget does not need.** Cache invalidation across an update was exercised
directly and worked: a second version prepared afresh while the first version's preparation stayed intact
and was still used, so the successor of the restart sequence runs the payload it was updated to.

**The verification clause fired the bad way, and this record wrote down in advance what to do.** It read:
*"Or the three observations under the verification obligation do not hold on some platform — in which case
the claim moves to alternative I on every platform, not only the one that failed, because one record
resolved two different ways is worse than either. Note that the hand-over gap named in the restart section
moves with it and is closed by that migration rather than merely relocated, so a failure there buys back
a property this record currently concedes."* **Observation 2 failed on Windows. Both halves were carried
out**: the claim moved on every platform, and the restart section's concession is withdrawn rather than
relocated. The clause is retired because it has been acted on, not because it stopped applying.
