## A child's `shutdown` answer can lose the race with its own exit, and the quit waits out the whole bound

When the last main window closes, main asks the run host to shut down (`apps/desktop/src/main/index.ts`, the
`window-all-closed` handler) and waits for the answer, bounded at 30 s, before it asks the workspace services and quits.
The run host does its shutdown, schedules `process.exit(0)` on a 0 ms timer (`apps/desktop/src/run-host/dispatch.ts`,
the `shutdown` case) and returns `ack`; the reply is posted afterwards, from the `.then` in
`apps/desktop/src/run-host/index.ts`, and `parentPort.postMessage` is asynchronous. Sometimes the exit wins: the process
is gone before its answer leaves, main never receives it, and the request waits its full bound. The workspace service
ends its `shutdown` the same way (`apps/desktop/src/workspace-service/index.ts`).

The effect was an orderly quit that took thirty seconds. The branch that built `PD-MONITOR-002` made it worse for a
while: its first version of the unanswered-`shutdown` line (commit `4f867a6`) turned the lost answer into an `error`,
`quit: the run host did not complete its shutdown (… no reply to shutdown within 30000 ms)`, written on a quit whose run
host had in fact finished and exited 0.

Found 2026-09-27 by the independent review of that branch: 3 of 26 last-window closes (`window.close` through the
driver) wrote the line and took 30,052–30,061 ms, 2 of them at the default level; the other 23 wrote nothing and took
38–72 ms. In a failing case `run host exited (0)` stood 23 ms after the close.

## Specs

None contradicted outright. `REQ-MONITOR-131` gives shutdown a force-exit backstop of 30 seconds, and the stall stayed
inside it; but the backstop is for a run that will not finish, and here nothing was left running. While the false line
stood, it also said an orderly quit was a loss, which is what `PD-MONITOR-002`'s `error` level exists to mean.

## Relevant files

- `apps/desktop/src/main/index.ts`: the `window-all-closed` handler, the only sender of `shutdown`.
- `apps/desktop/src/run-host/dispatch.ts`: the `shutdown` case and its 0 ms exit timer.
- `apps/desktop/src/run-host/index.ts`: the reply, posted after `dispatch` resolves.
- `apps/desktop/src/workspace-service/index.ts`: the service's `shutdown` case, the same shape.
- `packages/shell/src/process-link.ts`: `request`, which knows only an answer or its own bound.

## Repaired 2026-09-27 ([R-055](../../product/requests.md#r-055))

Main now races each quit-time `shutdown` against that child's own exit. `apps/desktop/src/main/exit.ts` gains
`watchChildExit`, which watches a child's `exit` from the moment it is forked — the run host's beside `runHostChild`,
each workspace service's on its entry in the `services` map — and `shutdownAtQuit`, which takes the request, the exit
and what to say if the child did not complete: an answer ends it; an exit ends it with nothing more to say (0 is the
orderly end whose answer was lost, and any other status has already been written at `error` by the exit handler); a
request that fails while the child still runs writes the `error` line, once; a child already gone is not asked at all.
The request's own rejection is always observed, whichever side loses.

`ProcessLink` is unchanged, and links are not closed on a child's exit: that would change how every in-flight request to
a dead child fails, and the quit is the only place that needs the exit as an answer. The run host's and the service's
exit on a 0 ms timer stay as they are — ordering the reply ahead of the exit at the source is not needed once main
treats the exit as the end.

Evidence: `exit.test.ts` covers seven cases with plain promises (answered; exit 0 first; a non-zero exit first; the
bound elapsing while the child runs; a child gone before the quit; a request that throws before it is sent; a `shutdown`
answered with a refusal). The last was added when the same review found a `refused` answer counted as completed: a
child whose `shutdown` throws answers `refused`, has closed nothing, and is then torn down with exit 0, so
`shutdownAtQuit` now treats any answer but `ack` as a `shutdown` not completed. Removing
the race from `shutdownAtQuit` fails the two exit-first cases, and removing the already-gone check fails that case.
Driven on the rebuilt app at the default level, 24 last-window closes wrote no `warning` or `error` line and took
40–69 ms. A second series of 32, on a build that briefly logged when the answer arrived (not committed), lost the answer
in 3 — the race still happens — and those 3 quits took 51, 107 and 61 ms and wrote nothing. A run host stopped with
SIGSTOP before the close still writes the `error` line after 30,056–30,058 ms, at `info` and at `warning`; one killed
with SIGKILL before the close writes only its own two `error` lines, and the quit no longer waits for the bound.
