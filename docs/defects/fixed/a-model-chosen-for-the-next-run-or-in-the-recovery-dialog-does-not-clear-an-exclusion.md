## A model chosen for the next run or in the recovery dialog does not clear an exclusion

REQ-MONITOR-194 lets a user choose a pair recorded out of quota "explicitly, from any model selector or from the
quota-wait decision surface", and says the choice "clears the recorded exclusion for that pair". Since 2026-10-02 the run's
own two paths clear it — the entry switch from the run header or the inspector, and the quota-wait surface
([an-explicit-choice-of-an-exhausted-pair-does-not-clear-its-exclusion.md](an-explicit-choice-of-an-exhausted-pair-does-not-clear-its-exclusion.md)).
Two other selectors do not. The composer's "Model for the next run" (REQ-MONITOR-146) writes the entry persona's model
into the configuration (`apps/desktop/src/renderer/main.tsx`, `onSetNextModel` → `personas.<entry>.model`), so the next
run receives it as its configured model and the engine cannot tell a choice made there from the value the file already
held; the exclusion stands, and the same-tier rule keeps the pair out of every candidate list. The recovery dialog's model
choice (REQ-NOTIFY-074, `Sessions.restartAfterAuthFailure`) pins the chosen model for an authentication failure and is not
wired to the exclusion either. Recorded 2026-10-02 (fin8, ladder-overrides) as the part of that note's repair it did not
reach; the repair would carry the composer's choice to the engine as a choice (not only as configuration), and clear the
chosen pair in the dialog's path, which lies in `sessions.ts`, outside that task.

## Outcome — repaired 2026-10-02 (fin10, quota-exclusions-and-choices, task 2)

- **The composer's choice** reaches the engine as a choice: `session-actions.ts`'s `setNextModel` writes
  `personas.<entry>.model` as before and then, with a session followed, sends the new session-scoped command
  `session.chooseNextModel {sessionId, modelKey}` (contracts `commands.ts` and `process-protocol.ts`, main's
  `commands/session.ts`, the run host's `dispatch.ts`). `Sessions.chooseNextModel` resolves the key through the
  side-effect-free `restingCatalogue` port and, if the session holds the pair out of quota, clears it in the memory every
  run of the session reads and in a resting read's, writing the `model_exhausted` entry carrying `cleared: true` that
  `ResilienceMemory.rehydrate` replays. It reaches a session no run of this process has started.
- **The recovery dialog's choice** clears the chosen pair's exclusion beside its pin in `restartAfterAuthFailure`; a
  restart that cannot begin restores it (`restored: true`), as it takes the pin back.
- The builder's note held: a select fires only on a change, so a chip already showing the excluded configured key cannot
  choose it again; the proof chooses another key first. With the second note of this task, the key stays choosable,
  annotated, from the run header, the inspector and the wait surface, which clear it — during a run; at rest neither is live,
  so the limit is recorded as an open note of its own (fin10's first repair round):
  [`the-composers-next-run-chip-cannot-choose-the-excluded-key-it-already-shows.md`](../the-composers-next-run-chip-cannot-choose-the-excluded-key-it-already-shows.md).
- Pinned in `packages/engine/src/run/ladder.test.ts` ("REQ-MONITOR-194: a pair chosen for the next run or in the recovery
  dialog is no longer excluded", four cases, each red with the clearing disabled): the composer's choice of the excluded
  `a1` makes the next run call `a1` (before: `b1`, the pre-call move), in this process and in a fresh one; the dialog's
  choice of `a1` restarts on it with the exclusion gone after a reload; a restart that cannot begin leaves it excluded. And
  in `apps/desktop/src/renderer/session-actions.test.ts` (the write, then the command; none without a session; refusals).
- Shown in the built app by `resilience-proof`'s new driven `next-run-choice` scenario: alpha refused on quota and the root
  moved to beta; a relaunch opens the session from the browser, chooses beta and then alpha in the composer's model chip,
  and the further prompt's root calls `scripted/alpha` with a `model_exhausted` `cleared: true` entry recorded. Red on a
  build of the code before ("alpha's exclusion cleared did not hold"), green after (load 1.0 to 2.6, nothing else running).

## Specs

- REQ-MONITOR-194: "from any model selector"; choosing the pair explicitly clears its exclusion.
- REQ-MONITOR-146: the composer's model choice applies to the next prompt.
- REQ-NOTIFY-074: the recovery dialog's model list.

## Relevant files

- `apps/desktop/src/renderer/main.tsx` — `onSetNextModel`: the composer's choice written to the configuration.
- `packages/engine/src/sessions.ts` — `restartAfterAuthFailure`: the dialog's choice, pinned and restarted.
- `packages/engine/src/run/run.ts` — `clearChosenExclusion`, the clearing the run's own paths use.
