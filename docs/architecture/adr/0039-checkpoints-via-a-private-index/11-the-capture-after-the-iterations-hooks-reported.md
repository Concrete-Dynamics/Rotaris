# ADR-0039 — Checkpoints are ordinary commits made through a private Git index; the checkpoint list is a table — The capture after the iteration's hooks — reported back 2026-10-13 (fin41, N68)

Part 11 of 11 of [ADR-0039](../0039-checkpoints-via-a-private-index.md), which indexes every part.

## The capture after the iteration's hooks — reported back 2026-10-13 (fin41, N68)

*The defect note is [`an-iterations-checkpoint-is-captured-before-its-iteration-end-hooks-run`](../../../defects/fixed/an-iterations-checkpoint-is-captured-before-its-iteration-end-hooks-run.md); the proof is `pnpm checkpoint-proof`'s `hook-capture`
launch.*

**What was falsified, and why it stood.** The first execution's "capture position" put the capture BEFORE the
`iteration_end` hooks and gave a reason: a hook "that later carries the checkpoint" could only be handed it if the capture
came first. REQ-HOOKS-082 asks for no such hook. It fixes an order — the hooks finish, then the iteration's checkpoint is
taken — so that a hook's edit to the tree (a formatter, a build artifact) belongs to the iteration whose hooks made it.
HARD constraint H-06 and `proposals/runtime.md` C8.6 say the same. Read as a payload rather than an order, the requirement
looked unbuilt ("owed") instead of contradicted, and the engine test pinned the built order (`capture:1` before
`hook:iteration_end`). The reading is struck through above and kept.

**As built.** `Run.iterate` records `iteration.end`, fires the `iteration_end` hooks and awaits them, then awaits the
capture, in a `finally`, so hooks that raise still leave the iteration its one capture (REQ-GIT-051) and the raise goes on
as before. The capture still finishes before the next iteration and before teardown. The two closes that fire no
`iteration_end` are unchanged: the decline's close of an iteration an earlier run left open captures without hooks, and
the record of an accepted explicit cancel captures nothing (`PD-ORCH-005` clause 36).

**The window this order opens** *(added 2026-10-14, fin43, a review finding of fin41)*. With the hooks before the capture,
a crash while the `iteration_end` hooks run — each bounded by its `timeout_seconds` plus REQ-HOOKS-033's 5 s grace, the
entries one after another — leaves a closed iteration with no checkpoint, and that iteration's work is taken by the next
iteration's capture. REQ-HOOKS-082 requires the order, so the window is its cost, not a defect; it is longer than the
capture-first order's, which a crash could only meet during the capture itself. OQ-103's "Nothing open to resume"
(`open-questions.md`) names the moment — an iteration closed while "its checkpoint is captured, its `iteration_end` hooks"
run; this paragraph states how long it now lasts.

**Measured.** `checkpoints.test.ts`: the order is `iteration_end` then `capture:1`; a hook that edits the tree after an
`await` has its edit in iteration 1's snapshot — the run's last; hooks that raise still leave one capture. The first two
were red on the code before. `checkpoint-proof`'s `hook-capture` launch, against Git: a global `iteration_end` hook writes
`HOOK.txt` after the scripted agent wrote `NOTES.md`, and checkpoint 1 lists both and its tree holds the hook's text.
