# ADR-0002 — Process topology — First execution — 2026-11-03, a utility process ends on its own (R-091)

Part 12 of 12 of [ADR-0002](../0002-process-topology.md), which indexes every part.

## First execution — 2026-11-03, the last-resort handler and the parent's end (R-091, hardening §3.2 row 1)

Consequence 1 says a run host that ends is not forked again and its runs settle through stale detection; nothing said how
a child ends when no request path ends it. Two ends were missing
([the last-resort note](../../../archive/defects/the-run-host-and-the-workspace-service-have-no-last-resort-exception-handler-and-end-without-a-word.md),
[the orphaned run host](../../../defects/the-run-host-outlives-a-killed-main-on-windows-and-keeps-calling-the-model.md)).
Both entries now install `superviseUtilityProcess` (`packages/platform/src/utility-process.ts`) first: an uncaught
exception or an unhandled rejection posts ONE `error` line with the stack to main and exits **70**; main's pid, probed every
250 ms, gone (or the parent pid changed) exits **69**. Main reads a status through `childExitReading` (`main/exit.ts`).

Measured on Windows 11 ARM64, Node 26.13.0, Electron 44.3.0, at `hrd1-child-process-failure`:

- **Before building** (a scratch app, never committed): `process.parentPort` has `start`, `pause` and `postMessage` and
  emitted no `close` when main was killed with `taskkill /F`; the child received no `disconnect` and no `exit`. Chromium
  ended it natively between about 0 and 3 s after the kill (four launches), with no JavaScript run — so the port's
  closing cannot be listened for on this platform. A pid probe every 100 ms saw main gone within 100 ms
  of the kill in 3 launches of 3. A line posted on the port and followed at once by `process.exit(70)` reached main before
  the exit event in 18 of 18 launches.
- **The built app**, driven (`pnpm app:drive start` on a scratch workspace), main killed with `taskkill /F`: the run host
  and the workspace service each read exit code **69** in four launches — 343 to 377 ms after the kill began in two, 1.2
  to 2.5 s in two — with the host's CPU at 100 % from another session's proofs.
- **`exit-trace-proof`** (CPU 26 % at its start, an Electron tree of another session beside it): 48 checks of 48, its two
  new `last-resort` launches reading "run host: an uncaught exception reached the run host's last-resort handler; ending
  with status 70 …" and "run host exited (70), its last-resort handler: …", both at `error`, the stack on the lines after,
  then an orderly quit exiting 0 (the workspace service likewise for a rejection); its `main-killed` launch read both
  children gone 60 ms after the kill.
- **Later runs of the same proof** (2026-11-04, CPU 100 %): in 2 of 4 runs the run host was still running 10 s after
  main's kill — the second time read through a held process handle, so no recycled pid — while its code-intelligence
  setup step ran a child; the workspace service beside it ended at once. Not reproduced in 34 kills outside the proof.
  The parent watch runs on the run host's main thread, and neither it nor Chromium's own end fired, which reads as that
  thread blocked; not established. The orphaned run host note stays open on it
  ([the note](../../../defects/the-run-host-outlives-a-killed-main-on-windows-and-keeps-calling-the-model.md)),
  and the proof now describes a survivor's threads and children.

Found by the same drive, not by this mechanism: a launch at 100 % CPU missed the run host's 5 s `hello` bound and ended main
on `UNHANDLED rejection in main: NoReplyWithinBound: no reply to hello within 5000 ms`, the note
[`a-launch-whose-run-host-misses-the-hello-bound-ends-on-an-unhandled-main-rejection.md`](../../../archive/defects/a-launch-whose-run-host-misses-the-hello-bound-ends-on-an-unhandled-main-rejection.md)
reproduced on its first reading of this host; OQ-462 (2) rules what such a launch does, built as hardening §3.2 row 2.

## First execution — 2026-11-04, the bounded ready and the loss notice (OQ-462; hardening §3.2 rows 2 and 3)

Consequence 1 is unchanged — the run host is never forked again — and [OQ-462](../../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-462)'s
ruling of 2026-11-01 is built as written (`apps/desktop/src/main/child-supervision.ts`, wired in `main/index.ts`): each
child's `hello` is bounded at 5 s (`RUN_HOST_READY_BOUND_MS`, `WORKSPACE_SERVICE_READY_BOUND_MS`) through `boundedReady`,
which never rejects; a child that misses it is ended through `endBeforeMain`; a child main did not end, while the
application is not ending (`QuitState.ending`), raises ONE persistent `error` notice with no action and no session
(`ChildLossReporter`, which holds a notice raised before the store exists); a service whose open was pending is refused
on the open's surface instead; and from a child's exit on, its `ProcessLink` answers every request with a named refusal
at once (`ProcessLink.end`: `runHost.gone`, `runHost.notStarted`, `workspace.serviceGone`). No action member and no
directive were added.

Measured on Windows 11 ARM64, Node 26.13.0, Electron 44.3.0, CPU at 100 % from other sessions' work, by
`exit-trace-proof` (64 checks of 64 in its last run): the `crash` launch's killed run host raised "The run host stopped"
with a dismiss, no action and "pid … exited with status 1: lost to a signal or a crash" in its detail; a `session.list`
was refused `runHost.gone` in 1 ms; a submit was refused with the draft kept. The `not-ready-run-host` launch (the seam's
`silent`) painted its window with "The run host did not start", refused a run-host command in 0 ms and quit 0, with no
unhandled rejection; `not-ready-workspace-service` refused its open with the transient "The project could not be opened"
and no notice. Unplanned, the proof's `orderly` launch of one run missed the bound on load alone and still painted its
window — the miss [OQ-473](../../../archive/architecture/open-questions/71-spikes-and-later-questions-38-continued-4.md#oq-473) asks about.

Two findings the build made and repaired in the same change: a refused `hooks.summary` at an open was read as a summary,
so a run host already gone raised "No model provider is authenticated yet" over the loss notice in the one slot (now a
refusal raises nothing there); and a loss notice for a run host whose kill landed only during the quit was raised as the
application ended (now nothing is raised once it is ending).

## First execution — 2026-11-05, the first answer bounded at 20 s from the fork, off the paint path (OQ-473)

[OQ-473](../../../archive/architecture/open-questions/71-spikes-and-later-questions-38-continued-4.md#oq-473)'s ruling of
2026-11-04 is built as written (hrdb, `hrdb-child-ready-and-killed-renderer`): `RUN_HOST_READY_BOUND_MS` and
`WORKSPACE_SERVICE_READY_BOUND_MS` are 20 s; each `hello` is asked immediately after its `utilityProcess.fork`
(`readyAtFork`, `main/child-supervision.ts`), so the request's own `ProcessLink` deadline is the bound from the child's start;
main no longer awaits the run host's `hello` before the notice store and `MainWindows`, and every run-host request made before
it settles is held on it (`ProcessLink.holdUntil`, `packages/shell`), then posted in order with its own bound, or refused
`runHost.notStarted` at once on a miss. Consequence 1 and OQ-462 (1), (3) and (4) are unchanged. Main now logs the `hello`'s
latency from the fork and the first window's show with where the `hello` stood; a seam fault `slow` (`holdMessagesFor`,
compiled out of a packaged build) makes a child answer nothing for its first seconds.

Measured on Windows 11 ARM64, Node 26.13.0, by `exit-trace-proof` in three runs: the first at 37 % CPU with no other
Electron tree, the second and third at 62 to 63 % with another session's tree (`Rotaris-wt-hrdb-diagnosticsf`, six Electron
processes) running proofs. The third read 93 checks of 93. The `hello` latency from the fork in the twelve launches of the
third run that did not delay it was **297 to 412 ms** (the first run's `orderly` launch 569 ms, the second's 521 ms) — far
under half the bound, so the ruling's question does not return. `not-ready-run-host` showed its window 218 to 222 ms after the
fork with the `hello` still awaited, missed at 20,000 ms with "The run host did not start" and a request refused in 0 ms;
`not-ready-workspace-service` refused its open at 20,000 ms. `slow-ready` (`run-host:slow:8000`) showed the window 207 to 243
ms after the fork, accepted the `hello` at 8,317 to 8,432 ms with no loss notice, held the open's `workspace.opened` hand-off
(a 5 s bound, asked about 7.9 s before the `hello`) until the `hello` and had it acknowledged, and a run completed. The first
run's check for a driver request before the `hello` could not be made as written: the driver's endpoint opens only after the
launch's open has settled, which waits on the run host, so the hand-off is the request the proof reads.
