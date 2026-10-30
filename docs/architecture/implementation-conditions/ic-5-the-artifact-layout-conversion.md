# IC-5 — the artifact-layout conversion is tested by something aimed at it

*Part of the register [`implementation-conditions.md`](../implementation-conditions.md), which states how an entry binds. Moved here verbatim on 2026-10-26 ([R-087](../../product/requests.md#r-087)); only relative links were re-pointed. Its status is the index's table.*

**Set by:** the Architecture Gate, decision 2, 2026-09-03. **Binds:** the first implementation of ADR-0058's
restore steps 6, 9 and 9a. **Discharged into:** a dated spike report or a conformance test, and a note on
ADR-0058.

**Why it exists.** D7's correction — staging is *arranged into the store's layout* before the install
rename, the manifest stays outside the store, and `origin.txt` is written by the restore — **ran on every
successful path of IC-1 and never failed.** That is not a test of it. It is the weakest evidence in the set
and the spike report says so in its own section 7. The failure mode is quiet in exactly the way the original
was: a restored store that opens, works, and is missing the one field the reclamation surface identifies it
by.

**What must be shown.** After a restore, the store directory holds the layout this record fixes and not the
container's: the database under the name the layout block fixes, no `manifest.json` inside the live store,
and **`origin.txt` present and naming the right project**. Show it against an artifact whose container
layout differs from the store layout, because an artifact that already matches tests nothing.

**What would count as failing it.** Any of the three absent or wrong. A restored store the reclamation
surface cannot describe is an orphan produced on the recovery path.

**Discharged 2026-09-03** — `packages/store/src/store.test.ts`, "IC-5": against an artifact in the container
layout, the restored directory holds `workspace.db`, no `manifest.json`, and `origin.txt` naming the project;
the counterfactual (`skipArrange`, D7 as it was) opens, works, and is missing all three. Noted on ADR-0058.
