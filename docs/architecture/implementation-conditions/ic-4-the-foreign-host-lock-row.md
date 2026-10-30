# IC-4 — the foreign-host lock row's fix is measured before the restore is signed off

*Part of the register [`implementation-conditions.md`](../implementation-conditions.md), which states how an entry binds. Moved here verbatim on 2026-10-26 ([R-087](../../product/requests.md#r-087)); only relative links were re-pointed. Its status is the index's table.*

**Set by:** the Architecture Gate, decision 2, 2026-09-03. **Binds:** the first implementation of
`REQ-SESSION-046`'s machine identifier and of `REQ-SESSION-201`'s foreign-lock report.
**Discharged into:** a dated spike report in `docs/architecture/spikes/`, and a note on ADR-0058.

**Why it exists.** D9 was the last specification defect in the build-wrong class and it was closed at both
ends on argument. **Spike 22 measured the defect; nothing has measured the fix.** The two halves fail
differently and neither covers the other, so both are named:

1. **The root cause.** `REQ-SESSION-046` now requires `host` to be an identifier the product mints once for
   this machine and keeps machine-locally — never the operating-system name, never anything a user or an
   administrator can change — and **renaming a machine must not change it**. The whole defect was that the
   field was described as stable and left unsourced, and the obvious source is the one thing that is not.
2. **The deadlock.** `REQ-SESSION-201` no longer lets a lock row naming another machine block recovery.
   Such rows are reported **together, as one condition**, and the user may confirm and proceed on a
   confirmation that **states the risk** — never per-session clearing as a precondition, never a bare
   refusal.

**What must be shown.** Rename the machine — actually rename it, not simulate the rename — with a store
holding lock rows, and confirm that `host` is unchanged, that no row becomes foreign, and that a restore
proceeds without any release action by the user. Separately, with a genuinely foreign row present, confirm
the restore reports the whole set as one condition, that the confirmation states the risk rather than only
the condition, and that proceeding does not require clearing rows one at a time.

**What would count as failing it.** `host` moving for any reason a rename can cause. A report that names
sessions individually as things to clear. A confirmation that states the condition without the risk — that
if the store genuinely is reachable elsewhere, a run there may be writing now.

**What it does not cover.** Whether two machines can reach one store at all, which is ESC-21's second
premise and is owed separately.

**Discharge, 2026-09-03 — half 1 discharged, half 2 prepared.** The foreign-lock report is shown three ways
(`spikes/machine-identifier-rename.md`): one refusal naming the whole set, the risk stated in the
confirmation, no per-row clearing. The rename experiment is a two-phase harness
(`packages/platform/src/machine-id-rename.spike.test.ts`) the owner runs around a real rename and reboot; IC-4
**stays open on that half** until its figures are recorded in the report.
