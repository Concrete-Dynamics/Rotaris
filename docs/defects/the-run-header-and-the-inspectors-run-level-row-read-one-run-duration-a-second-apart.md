## The run header and the inspector's run-level row read one run's duration a second apart

The run header freezes at a run's total wall-clock duration and the inspector's run-level row fixes the run-level agent's
elapsed time, and both read the same interval, `session.runStartedAt` to `session.updatedAt`. They turn it into whole
seconds by two rules: the header's `formatDuration` floors it, the row's `elapsedLabel` rounds it to the nearest second.
Whenever the interval's fraction is half a second or more, the two read a second apart, side by side, for one run.

Found by the default live run at `c2fdd6a` (autopsy K1, the orchestrator's `live-c2fdd6a-default-autopsy.md`) and seen
again at `c2a9444`: `edit` read "Completed 2:13" in the header against "orchestrator done · 2m 14s" in the inspector
(133.67 s); `terminal` "3:33" against "3m 34s" (213.79 s); `frictions` "0:20" against "21s" (20.74 s); `resume` agreed
at "1:08" and "1m 8s" (68.22 s). The session list floors too, as the header does.

## Specs

REQ-CHAT-158 freezes the header at "that run's total wall-clock duration"; REQ-MONITOR-107 fixes an agent's figure at
"the difference between its completion and spawn timestamps". Neither names a rounding, but each names the same
duration for the run-level agent, so two figures for it contradict both. Cosmetic: nothing in the run is affected.

## Relevant files

- `packages/ui/src/composer.ts` — `formatDuration` (`Math.floor`), used by the run header (`runTimingLabel`), the wait
  header's countdown and the session list.
- `packages/ui/src/AgentTree.tsx` — `elapsedLabel` (`Math.round`), used by the agent tree, the Mission table, the
  inspector's meta line, the persona window and the transcript's "This task" line.
- `packages/ui/src/agents.ts` — `runLevelAgent`, which gives the run-level row the header's interval.
