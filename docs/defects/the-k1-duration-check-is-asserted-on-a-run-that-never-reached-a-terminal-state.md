## The K1 duration-agreement check is asserted on a run that never reached a terminal state

The live run's K1 check (`checkRunDuration` in `apps/desktop/scripts/live-run.mjs`) reads the run header and the
inspector's run-level row at a scenario's capture and FAILS unless they name one number of seconds. The two agree by
design only once the run is terminal: while a run is live the header counts the model call in flight and restarts at
each call (REQ-CHAT-158), while the run-level row counts from the agent's spawn (REQ-MONITOR-107). The check asserts
whatever the capture saw, so when a scenario's wait runs out and the capture probes a run that is still going, it fails
on two figures the specification requires to differ.

Found by the acceptance round on merged main (finding L4, harness defect, degrades). In the `terminal` scenario of pack
`2026-10-14T15-58-45-917Z` (head `3c3f447`) the wait timed out after 550,000 ms (`terminal/app.log` line 84) and the
capture probed a live run (lines 85 to 87): the header read `1:00` with `data-seconds` 60 and `data-frozen` 0, the
inspector `orchestrator` `running · 9m 13s · 9 tool calls`. The check failed as "terminal: the run header and the
inspector's run-level row read the run's duration as one figure (K1)". The timed-out wait is already a failure of its
own ("the terminal run reached its result inside the wait"), so this one adds a second, false finding to it. It is not a
recurrence of the repaired K1 note
(`docs/defects/fixed/the-run-header-and-the-inspectors-run-level-row-read-one-run-duration-a-second-apart.md`): the
product read both surfaces as the specification asks.

## Specs

None contradicted by the product. The harness contradicts the reading of REQ-CHAT-158 (a live header counts the call in
flight; it freezes at the run's total only at a terminal state) and REQ-MONITOR-107 (an agent's figure counts from its
spawn while it runs) that its own comment states: "at the capture the run header's frozen duration and the inspector's
run-level row read one interval". The header marks which reading it shows with `data-frozen` (`packages/ui/src/RunHeader.tsx`).

## Relevant files

- `apps/desktop/scripts/live-run.mjs` — `checkRunDuration` (line 951), called by `ask`, `edit`, `frictions` and
  `terminal`, which asserts the agreement whatever `data-frozen` read.
- `apps/desktop/scripts/lib/run-duration-agreement.mjs` — `runDurationReading` (line 44), which reads `frozen` but
  leaves it out of `agree` and out of any verdict.
- `packages/ui/src/RunHeader.tsx` — the header's `data-frozen` (`'1'` once the run is not busy).
