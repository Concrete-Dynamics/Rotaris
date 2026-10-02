## A model chosen for the next run or in the recovery dialog does not clear an exclusion

REQ-MONITOR-194 lets a user choose a pair recorded out of quota "explicitly, from any model selector or from the
quota-wait decision surface", and says the choice "clears the recorded exclusion for that pair". Since 2026-10-02 the run's
own two paths clear it — the entry switch from the run header or the inspector, and the quota-wait surface
([an-explicit-choice-of-an-exhausted-pair-does-not-clear-its-exclusion.md](fixed/an-explicit-choice-of-an-exhausted-pair-does-not-clear-its-exclusion.md)).
Two other selectors do not. The composer's "Model for the next run" (REQ-MONITOR-146) writes the entry persona's model
into the configuration (`apps/desktop/src/renderer/main.tsx`, `onSetNextModel` → `personas.<entry>.model`), so the next
run receives it as its configured model and the engine cannot tell a choice made there from the value the file already
held; the exclusion stands, and the same-tier rule keeps the pair out of every candidate list. The recovery dialog's model
choice (REQ-NOTIFY-074, `Sessions.restartAfterAuthFailure`) pins the chosen model for an authentication failure and is not
wired to the exclusion either. Recorded 2026-10-02 (fin8, ladder-overrides) as the part of that note's repair it did not
reach; the repair would carry the composer's choice to the engine as a choice (not only as configuration), and clear the
chosen pair in the dialog's path, which lies in `sessions.ts`, outside that task.

## Specs

- REQ-MONITOR-194: "from any model selector"; choosing the pair explicitly clears its exclusion.
- REQ-MONITOR-146: the composer's model choice applies to the next prompt.
- REQ-NOTIFY-074: the recovery dialog's model list.

## Relevant files

- `apps/desktop/src/renderer/main.tsx` — `onSetNextModel`: the composer's choice written to the configuration.
- `packages/engine/src/sessions.ts` — `restartAfterAuthFailure`: the dialog's choice, pinned and restarted.
- `packages/engine/src/run/run.ts` — `clearChosenExclusion`, the clearing the run's own paths use.
