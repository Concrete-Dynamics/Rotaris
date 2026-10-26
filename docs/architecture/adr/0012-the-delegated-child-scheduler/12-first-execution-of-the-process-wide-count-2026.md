# ADR-0012 — The delegated-child scheduler: a persisted ledger, not a promise graph — First execution of the process-wide count — 2026-09-30: the cap was one iteration's

Part 12 of 14 of [ADR-0012](../0012-the-delegated-child-scheduler.md), which indexes every part.

## First execution of the process-wide count — 2026-09-30: the cap was one iteration's

This record put the ledger in **one session's rows** and said nothing of a count across sessions; `REQ-CONFIG-094` counts
every child on a `models:` entry "across the whole process … children belonging to any other session running in the same
process". The run host holds every live session at once (ADR-0013), so the two disagree the moment two sessions run.
Acceptance round 1 (finding A13) confirmed it by driving it: two sessions in one `Sessions`, one key with `max_parallel`
1, the first session's child holding its slot — the second session's child started and ran to `succeeded` beside it
(`packages/engine/src/children/children.test.ts`, "acceptance A13 …", red before the repair).

**What changed, and what did not.** The ledger is still one iteration's rows and the held-child queue is still each
session's (`model_slot_queue`). What the cap is judged against is now the process's count: `ModelSlots`
(`packages/engine/src/children/model-slots.ts`, held by `Sessions`) is joined by every run for as long as it is under way,
each run answering how many of its own children hold a slot on a key (`ChildLedger.slotsInUseHere`), and
`ChildLedger.slotsInUse` adds the others' (`slotsHeldElsewhere`). A child's terminal state wakes every other run's
scheduler for one pass (`onSlotFreed`), and so does a run's end — without the wake, a session whose root is waiting on its
held child never passes again, which the case pins (it times out with the wake removed). The count is process state,
held in memory: a slot is a live child, and no child outlives its process (REQ-ORCH-053).

**Corrected in verification, the same day: a paused child keeps its place.** The paragraph above said `ModelSlots` "is
joined by every run for as long as it is under way", each run answering for children in `starting`, `running` or
`summarizing`. That was falsified by the branch's own verifier: a `paused` child was counted by nothing, and a run coming
to rest left `ModelSlots`, so with `max_parallel` 1 a paused session's slot went to another session's child, and a
Continue then resumed the paused child into `running` beside it — two slots on a key capped at 1, the defect this repair
exists for, reached through PD-ORCH-005's pause and continue. PD-ORCH-005 clause 4 says each resumed agent "keeps the place
in every child limit it already held", so the replacement reads it literally (**OQ-149**): a child `paused` out of
`running` or `summarizing` (its `resume_state`) holds its slot while its session rests (`holdsModelSlot` in
`children/ledger.ts`, which `ChildLedger.slotsInUseHere` now uses), and it is **each session**, not each run, that joins
`ModelSlots`: `Sessions` joins a session when a run of it starts or continues, answers for it from its store (every child
of the session that holds a slot), and lets it go only when no run of it is under way and none of its children holds a
place. A decline (clause 6) or a cancel at rest (clause 16) gives the place up and wakes the others. Three cases beside
the first two pin it (`children.test.ts`, "PD-ORCH-005 clause 4 / 6 / 16 …"), each red with its half of the repair
removed. A paused session therefore holds its places until it is continued, declined or cancelled; a session paused by
an earlier process holds none until a run of it starts in this one (OQ-149 states both).

**Three edges the count leaves, recorded rather than repaired.** (1) The key is the string alone: sessions of two
workspaces whose configurations define different entries under one key share a count, each judged against its own
session's cap (**OQ-150**). (2) A promoted child that `startOne` refuses on `maxActive` sits `queued`, which holds no
slot, so another session's pass in the same wake may take the slot — the edge one session already had, now across
sessions. (3) Every `slotFree` check reads each other joined session's children from its store: one query per session
per scheduling decision, which is nothing at today's scale.

**What was not measured.** No built app or live run starts two sessions at once: the live run's scenarios are one session
each and one endpoint is registered. `pnpm mission-proof`, whose scenario holds children behind a `max_parallel: 1` cap in
one session, shows that path unchanged. The release order across sessions is **OQ-148**. The rows are in
[`../first-executions.md`](../../first-executions.md).
