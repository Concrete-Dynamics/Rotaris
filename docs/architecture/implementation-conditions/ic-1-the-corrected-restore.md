# IC-1 — the corrected restore is re-measured before its implementation is signed off

*Part of the register [`implementation-conditions.md`](../implementation-conditions.md), which states how an entry binds. Moved here verbatim on 2026-10-26 ([R-087](../../product/requests.md#r-087)); only relative links were re-pointed. Its status is the index's table.*

> **DISCHARGED 2026-09-02.** Run as `../spikes/corrected-restore-rerun.md`. **All five experiments pass and
> every counterfactual reproduces the original defect**: the second liveness evaluation caught the raced run
> 30 of 30 and removing it destroyed the session 10 of 10; displace-then-rename returned the target
> byte-identical 30 of 30 where the single-rename reversal reached the forbidden empty-store-directory state
> 10 of 10; the bound refused in 2,008–2,020 ms where the unbounded handshake had returned nothing inside
> 15,000 ms; the lease re-admitted runs 10 of 10 where the state had persisted for the life of the instance;
> and the aside-name's counter was needed in 30 of 30 forced collisions, where the pre-correction name lost a
> displaced store 30 of 30. Two wording refinements are owed to ADR-0058 and are applied. **The condition is
> met; the entry is kept rather than deleted, because what it required is now evidence.**


**Set by:** GD-3, 2026-09-02. **Binds:** the first implementation of the store restore of ADR-0058 and
`REQ-SESSION-201`. **Discharged into:** a dated spike report in `docs/architecture/spikes/`, and a note on
ADR-0058.

**Why it exists.** Spike 22 built ADR-0058's restore for the first time and it failed in 30 of 30 attempts,
destroyed a live session, and had a reversal that failed in exactly the case it exists for. Those three
defects are now corrected — **on paper**, which is precisely the state ADR-0058 consequence 17 records as
not being evidence. Three mechanisms in this record have gone from paper to first execution and all three
held a defect no reading had caught. The corrections have not been run.

**What must be shown.** Two experiments, both narrow, and both aimed at the corrections rather than at the
mechanism generally:

1. **The window is closed.** Launch a run into the interval between the refusal of new runs being put in
   force and the run host's acknowledgement of it, and confirm the second liveness evaluation refuses the
   restore, that the run continues, and that its session and every row it wrote survive intact. This is the
   defect that destroyed a session at twenty rows a second in the measured run, so the counterfactual is
   already known: without the correction, the session and all its rows are gone.
2. **The reversal survives the case it exists for.** Force the install rename to fail with the target name
   occupied — the case where the original reversal failed with the identical error — and confirm
   displace-then-rename returns the target store byte-identical to its state before the restore began, and
   that no store directory exists holding no database.

**What would count as failing it.** Either experiment producing a result the corrected ADR-0058 does not
predict. A run that cannot be raced into the window is not a pass; it is an inconclusive result and the
harness needs fixing, because the unmodified mechanism admitted one on the first attempt.

**What it does not cover.** The eight defects spike 22 found and did not correct (D3, D5, D6, D7, D8, D9,
D10, D11) are open items in their own right and are not discharged by this condition. *(2026-10-13: D8 and D11
repaired, and D5 deferred with OQ-48 under R-071 — ADR-0058 consequence 18 says how; this condition is unchanged.)*
