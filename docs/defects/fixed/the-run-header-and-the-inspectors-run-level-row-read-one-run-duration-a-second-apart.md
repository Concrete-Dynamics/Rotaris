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

## Outcome — repaired 2026-10-07

One rule now turns every elapsed figure into whole seconds: `wholeSeconds` in `packages/ui/src/composer.ts`, the seconds
completed (floor), as a clock reads and as the header and the session list already did. `formatDuration` and
`elapsedLabel` both call it, so the run header, the session list, the wait header's countdown, the agent tree, the
Mission table, the inspector's meta line, the persona window and the transcript's "This task" line read one interval as
one figure. Floor rather than round because a ticking clock that reads `0:20` has completed twenty seconds, and the
header, the countdown and the session list, the larger set of surfaces, already read it so.

Pinned by `packages/ui/src/agent-clock.test.ts` "REQ-CHAT-158, REQ-MONITOR-107 (K1): the run header and the run-level
row read one run duration alike", which drives the run-level agent through `runLevelAgent` at the intervals the live run
saw (133.67 s, 213.79 s, 20.74 s, 68.22 s, and 0.5 s) and reads the header's label beside `elapsedLabel` and the agent
tree's meta: red without the change (`2m 14s`, `3m 34s`, `21s` and `1s` where the header read `2:13`, `3:33`, `0:20` and
`0:00`, and a live agent's `1m 3s` at 62.6 s).

Shown by the live run that found it: `live-run.mjs` now probes the run header and the inspector at the capture of `ask`,
`edit`, `frictions` and `terminal` and checks that they read one figure (`lib/run-duration-agreement.mjs`, its own test
red on K1's pairs). On this branch, against `katalyst`
(`--only=ask,edit,frictions,terminal`, pack `2026-10-07T01-25-28-009Z`, `live-run PASSED`), all four agreed, two of them
at intervals the old rule would have split: `edit` 128.623 s read `2:08` and `done · 2m 8s` (the row would have read
`2m 9s`), `frictions` 14.553 s read `0:14` and `done · 14s` (it would have read `15s`); `ask` 7.358 s `0:07`/`7s`,
`terminal` 216.352 s `3:36`/`3m 36s`.
