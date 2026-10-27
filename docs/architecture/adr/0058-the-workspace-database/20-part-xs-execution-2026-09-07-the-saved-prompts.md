# ADR-0058 — The workspace store: machine-local, found by a workspace identifier, and how it is backed up — Part X's execution — 2026-09-07, the saved prompts as rows (schema v11)

Part 20 of 22 of [ADR-0058](../0058-the-workspace-database.md), which indexes every part.

## Part X's execution — 2026-09-07, the saved prompts as rows (schema v11)

*Recorded under GD-10.* The first two tables this record has taken that are **workspace-scoped rather than
session-scoped**: `prompt_history` and `prompt_stash` (`REQ-LIBRARY-137/138/139`), one row per entry, newest by
highest `seq`, `AUTOINCREMENT` so a number displaced by the cap is never handed to a later entry. Neither
references `sessions`, so neither is touched by `REQ-SESSION-166`'s delete or by its cascade — the fourteen tables
that section counts are still fourteen. The reason one row per entry rather than one document per list is a
sentence of the requirement and not a preference: `REQ-LIBRARY-138` says "persisting one entry MUST NOT require
rewriting the others", which a JSON list in a column fails on every write.

**What moved into this store, and from where.** ADR-0042 held prompt history and stash as a file at
`<workspace>/.rotaris/rotaris-prompts.json` in a byte-exact format, and named the withdrawal of that format as the
one thing that would reopen the question. `REQ-CHAT-045` and `REQ-SHELL-157` were amended to fix no path, no file
name and no document format and to defer to `REQ-LIBRARY-138`, which names this store. The falsified reading is
kept in ADR-0042 beside its replacement and in `schema.ts`'s v11 comment; it is a specification amendment rather
than a defect found by executing anything.

**Found: nothing.** The DAL's shape, the caps, the two readers' plans and the transaction boundaries held as
written. The two readers are `ORDER BY seq DESC LIMIT <cap>`, which the `INTEGER PRIMARY KEY` serves in reverse
with no sort, and `store.test.ts` asserts the absence of a `TEMP B-TREE` in both plans and in the take's
`LIMIT 1 OFFSET ?` (spike 8's rule: a declared shape is a claim about a plan, and the plan is asserted). No index
was declared and none was needed. `REQ-LIBRARY-139`'s cap is enforced **on load as well as on save**, and the load
half is a write — the blank rows and the rows beyond the cap are deleted rather than skipped, so a second load has
nothing left to discard and the store never disagrees with the surface about what it holds.

**Figures (`.library-proof/results.json`, six launches over four scratch profiles).** 201 pushes through the real
command left exactly 200 rows, newest `entry 201`, oldest `entry 2`, `entry 1` gone, with no notice and no line of
its own; 105 rows planted directly beneath the cap loaded as 100 and left 100 in the table. A prompt stashed from
the composer was in `prompt_stash` after the process exited and was on screen after a **relaunch**. A take under a
filter removed the entry at original index 2 and left the entry at screen position 1 untouched. Twenty writes in
one burst settled with the last visible and the typed search text unchanged.

**One interaction recorded, owed elsewhere rather than repaired here.** `REQ-CHAT-044` requires an entry landing in
a **non-empty** composer to be appended after one blank line. On the Library's own routes that case cannot arise in
this build: `REQ-LIBRARY-107` switches to the Workspace view as part of using an entry, the composer remounts with
no text because `REQ-SHELL-159`'s per-workspace composer draft is not built, and the incoming text therefore always
meets an empty composer. The append is reachable — and is measured by the proof — on the stash dialog's route,
which is opened from the transcript toolbar with the Workspace view already showing. Nothing is wrong here; it is
recorded so that whoever builds `REQ-SHELL-159` knows the rule becomes reachable on four more routes that day.
