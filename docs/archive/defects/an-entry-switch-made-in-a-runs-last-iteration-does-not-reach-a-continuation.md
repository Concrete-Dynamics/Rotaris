## An entry switch made in a run's last iteration does not reach a continuation

A switch of the entry model or reasoning level is held on its `Run` alone (`entryOverride`,
`packages/engine/src/run/run.ts`). A run's next iteration inside the same `Run` (a queued prompt, a task added while it
runs) honours the switch. But when the iteration in flight is the run's last, the next iteration is a continuation: the
user's next prompt starts a new `Run`, which builds the root on its configuration's model and reasoning level. The
switch's system row nonetheless said "Entry model switched to <key>; it applies from the next iteration." (and the same
for the reasoning level), and the next iteration does not run on it. The autopsy reader already states the
corresponding coarse reading
([the-autopsy-reader-keeps-a-switched-key-across-a-continuation-that-records-no-snapshot.md](the-autopsy-reader-keeps-a-switched-key-across-a-continuation-that-records-no-snapshot.md)).
Noticed by the verifier of `fin5-noticed-gaps` (repair round 1, optional finding) and recorded there. Not repaired. The
specification says "the run's entry model", and REQ-MONITOR-143 says a switch after the run loop has closed "still
records the override". Whether a continuation is the same run for this purpose, and so inherits the override, or the
row should say the switch ends with the run, is for the owner, raised with the repair.

## Status — 2026-10-02 (fin8, ladder-overrides, task 2): raised as OQ-185 (OQ-183 on the branch, renumbered at its merge); the reader's share repaired; the product part open

- **Raised:** [OQ-185](../../architecture/open-questions.md) asks the owner whether a mid-run switch of the entry model or
  reasoning level reaches the session's next run. The build proceeds under "a switch ends with its run", as it stands.
  The product part of this note waits on that ruling and stays open: no agent rules it.
- **Repaired, the reader's share:** the autopsy reader no longer carries a switched key across a continuation whose
  snapshot names no entry model; it prints `undetermined`, right under either answer
  ([the-autopsy-reader-keeps-a-switched-key-across-a-continuation-that-records-no-snapshot.md](the-autopsy-reader-keeps-a-switched-key-across-a-continuation-that-records-no-snapshot.md)).
- **When it is ruled:** if the switch reaches the next run, it is recorded session-wide (REQ-SESSION-026's runtime
  override) and `launchContinuation` starts from it unless the composer's next-run choice differs, pinned by a sessions test
  (a switch in the last iteration, a continuation, the root's first call on the switched key). If it ends with its run,
  the row says so when no further iteration of the run is queued. Either way the reader then reads the ruling.

## Specs

- REQ-MONITOR-142: a switch applies from the next iteration onward, and its row says so.
- REQ-MONITOR-143: after the loop has closed a switch still records the override.
- REQ-MONITOR-146: composer-side choices apply to the next prompt, the other path to a continuation's model.

## Relevant files

- `packages/engine/src/run/run.ts`: `entryOverride`, `setEntryModel`, `setEntryReasoning`.
- `packages/engine/src/sessions.ts`: the continuation's launch (`launchContinuation`), which builds a new `Run` from the
  configuration.

## Outcome — 2026-10-06 (plan fin21, under [R-071](../../product/requests.md#r-071)): ruled, and the row repaired

OQ-185 was ruled by the owner as recommended: a switch from the run header or the inspector **ends with its run**, as built,
and its row says so; the composer's model and reasoning chips are the one control for the next run
([`PD-MONITOR-006`](../../product/directives/pd-monitor-006.md#pd-monitor-006), narrowing REQ-MONITOR-142 and REQ-SESSION-026). So the
continuation not taking the switch is the product, and the fault left was the sentence. The rows now read "Entry model
switched to X; it applies for the rest of this run, after the iteration in flight. The next run starts on the composer's
model." and "Entry reasoning level switched to L; it applies for the rest of this run, after the iteration in flight. The
next run starts at the composer's reasoning level." (`Run.setEntryModel`, `Run.setEntryReasoning`). The autopsy readers'
`undetermined` for a continuation whose snapshot names no entry model stands, their comments now citing the ruling: the
switch did not reach that run, but the composer may have changed the configuration since the last snapshot. Pinned by the
row cases of `packages/engine/src/run/ladder.test.ts` (red before, the old sentence) and shown by `resilience-proof`'s
`switch-back` and `switch-over-override` on the built app, which read the new row.
