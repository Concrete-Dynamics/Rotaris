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

## Specs

- REQ-MONITOR-142: a switch applies from the next iteration onward, and its row says so.
- REQ-MONITOR-143: after the loop has closed a switch still records the override.
- REQ-MONITOR-146: composer-side choices apply to the next prompt, the other path to a continuation's model.

## Relevant files

- `packages/engine/src/run/run.ts`: `entryOverride`, `setEntryModel`, `setEntryReasoning`.
- `packages/engine/src/sessions.ts`: the continuation's launch (`launchContinuation`), which builds a new `Run` from the
  configuration.
