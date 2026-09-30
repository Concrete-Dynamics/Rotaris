## The per-model cap counts only one iteration's children

`ChildLedger.slotsInUse(modelKey)` counts the children holding a slot on a model among `this.all()` — the children of
**one iteration of one session** (`childrenOfIteration(sessionId, iteration)`). REQ-CONFIG-094 counts every child running
against the `models:` entry "across the whole process and at every delegation depth — … children belonging to any other
session running in the same process". `Sessions` holds its live runs in a map keyed by session, and each run's ledger
counts only its own iteration's children, so two sessions running at once in one run host could each fill a
`max_parallel` of 2 and put four children on the model. Whether two sessions do run at once in one run host on today's
routes was not established.

Noticed 2026-09-29 while repairing live-run finding D5 (a child's cap was looked up by its model's bare id), after which
the cap is found at all. Established by reading the code; not driven.

## Specs

REQ-CONFIG-094 (what counts against the cap: every child on that entry, process-wide, by the entry's key; a synthetic copy
counts against its entry), with REQ-MONITOR-020 (only running and summarizing agents count) and REQ-ORCH-050. ADR-0012
places the ledger in one session's rows and says nothing of a process-wide count.

## Relevant files

- `packages/engine/src/children/ledger.ts` — `slotsInUse`, `slotFree`, `all()` (one iteration's rows).
- `packages/engine/src/sessions.ts` — `Sessions.live`, one entry per running session.
- `packages/engine/src/children/scheduler.ts` — the promotion that frees a slot, within one iteration.
- `apps/desktop/src/run-host/configuration.ts` — `modelCapFor`, the cap by `models:` key.

## Repaired 2026-09-30 under R-067 (acceptance round 1, finding A13)

Confirmed on the branch first, by driving it rather than reading: two sessions started in one `Sessions` — the registry
the run host builds once for the whole process (`apps/desktop/src/run-host/host.ts`; ADR-0013: "the COMPLETE set of live
sessions") — each delegating one `coding-agent` child on the key `openai-compatible--katalyst/m` with `max_parallel` 1.
With the first session's child holding its model call, the second session's child was not held: it started and ran to
`succeeded` beside the first. So two sessions do run at once in one run host, and each filled the cap.

What changed: `Sessions` holds one `ModelSlots` (`packages/engine/src/children/model-slots.ts`), which every run joins when
it starts or continues and leaves when its run ends. `ChildLedger.slotsInUse` — the count `slotFree`, the scheduler's
promotion and `delegate`'s "N of M slots in use" read — is now this iteration's children (`slotsInUseHere`) plus the slots
every other run under way holds on the key (`slotsHeldElsewhere`). A child's terminal state wakes every other run's
scheduler for one pass (`ChildrenDeps.onSlotFreed` → `ModelSlots.freed` → `Run.wakeForFreedSlot`), and so does a run's
end, so a child another session holds `waiting_on_model_slot` is promoted when the slot frees. The held-child queue is
still each session's; the release order across sessions is raised as
[OQ-148](../../architecture/open-questions.md), with the reading built.

Pinned by `packages/engine/src/children/children.test.ts` ("acceptance A13: the per-model cap counts every child in the
process …", two cases: the second session's child is held `waiting_on_model_slot` with "1 of 1 slots in use", then promoted
and run to `succeeded` while the first session's run is still under way; a run that has ended holds no slot) — the first
fails on the unrepaired code, receiving `succeeded` where `waiting_on_model_slot` is expected, and times out at 30 s with the
terminal wake removed — and `packages/engine/src/children/model-slots.test.ts` (three cases). `pnpm vitest run
packages/engine/` 53 files, all green, under Node 24 as root.

Not shown in the built app or the live run: no proof and no live-run scenario starts two sessions at once (the live run's
scenarios are one session each). `pnpm mission-proof --skip-build` after `pnpm build`, whose `waiting` scenario holds two
children behind a `max_parallel: 1` cap in one session, passed with one child running and two waiting at 6 s, so the
one-session path is unchanged. ADR-0012 carries the report back.

### Corrected in verification, the same day: a paused child keeps its place

The outcome above said every run "joins when it starts or continues and leaves when its run ends", counting children in
`starting`, `running` or `summarizing`. That left the repair incomplete, and the branch's verifier showed it: a `paused`
child was counted by nothing, and a run coming to rest left `ModelSlots`. With `max_parallel` 1, the first session was
paused with its child mid-step; the second session's child then took the slot and ran; continuing the first resumed its
child straight into `running` beside it — two slots held on a key capped at 1, through PD-ORCH-005's pause and continue.

PD-ORCH-005 clause 4 says each resumed agent "keeps the place in every child limit it already held", and the correction
reads it literally ([OQ-149](../../architecture/open-questions.md), with the reading built): a child `paused` out of
`running` or `summarizing` holds its slot while its session rests (`holdsModelSlot` in
`packages/engine/src/children/ledger.ts`), and it is each **session** that joins `ModelSlots` — from the first run of it
until no run of it is under way and none of its children holds a place, answering from its store. Continuing without
the paused agents (clause 6) or cancelling one at rest (clause 16) gives the place up and wakes the other sessions.

Pinned by three more cases in the same describe of `children.test.ts`: "PD-ORCH-005 clause 4" (the second session's child
is held while the first rests, and from the continue to both runs' ends no poll sees more than one child holding a slot
across the two sessions), "clause 6" (declining frees the place before the first session's new iteration has any child)
and "clause 16" (a cancel at rest frees it). Each fails without its part of the correction: all three with the paused
state not counted; clause 6 with the decline's wake removed; clause 16 (timing out at 30 s) with the cancel's release
removed. The key is summed by its string across workspaces whose configurations may define it differently
([OQ-150](../../architecture/open-questions.md)). Corrected 2026-09-30 under R-067.
