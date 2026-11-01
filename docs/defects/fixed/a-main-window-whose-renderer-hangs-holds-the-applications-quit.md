## A main window whose renderer hangs holds the application's quit

A main window's close guard is the renderer's, asked by `executeJavaScript` (`askRendererGuard`,
`apps/desktop/src/main/main-windows.ts`). Since 2026-10-14 a renderer that is **gone** (crashed, killed, its contents
destroyed) cannot hold the question: it rejects at once or the moment the renderer goes, and a guard that cannot answer
allows ([`a-main-window-whose-renderer-crashed-holds-the-applications-quit-forever.md`](a-main-window-whose-renderer-crashed-holds-the-applications-quit-forever.md)).
A renderer that is alive but **hung** — its main thread in an endless loop or a long synchronous task — is not gone, so the
question is sent and never answered while it hangs, and nothing bounds the wait: a person's close of that window is held,
and so is the application's quit (`closeThroughGuards`, `apps/desktop/src/main/exit.ts`), a SIGTERM's included, until the
renderer recovers or the process is killed. Chromium reports such a renderer through `webContents`' `unresponsive` event;
main listens for none.

Read from the code while repairing the crashed case (fin43, 2026-10-14); not measured: no proof hangs a renderer. Recorded,
not repaired: outside that bundle's tasks. A repair has to say when a renderer that is still alive "cannot answer" — the
guard may legitimately be waiting on a person's Save/Discard/Cancel (REQ-SHELL-124), which no time bound may answer for —
so whether Chromium's `unresponsive` judgement is that point is a question to raise with the repair, not to decide in it.

## Specs

- REQ-SHELL-119 (and REQ-SHELL-121's quit): each close guard can abort the close only by its answer; `guardClose` documents
  that a guard that cannot answer allows. A hung renderer holds the close and the quit with no answer and no bound.
- PD-ORCH-005 clause 9: the application's quit asks every main window's guard before confirming any, so one hung renderer
  keeps the run host from being asked to `shutdown`.

## Relevant files

- `apps/desktop/src/main/main-windows.ts` — `askRendererGuard`, which releases the question for a renderer that is gone but
  not for one that is unresponsive; `guardClose`, the window's `close` handler.
- `apps/desktop/src/main/exit.ts` — `closeThroughGuards`, which awaits every guard with no bound.
- `apps/desktop/src/main/index.ts` — `closeGuard`, REQ-SHELL-021's gate 1 through the same question.

## Outcome — repaired 2026-10-14 (fin44, `fin44-hang-and-seams`), under `PD-SHELL-010`

The question this note left open was raised and ruled: [OQ-297](../../archive/architecture/open-questions/60-spikes-and-later-questions-27.md#oq-297), the consortium's
HR1 under [R-072](../../product/requests.md#r-072), minted [`PD-SHELL-010`](../../product/directives/pd-shell-010.md#pd-shell-010). Chromium's
`unresponsive` alone is not the point a live renderer "cannot answer"; main's own liveness probe is, with `unresponsive` kept as a
second signal. (In the proof below the event never fired for a stopped renderer that had no input sent to it: the probe alone
released both launches.)

`askRendererGuard` (`apps/desktop/src/main/main-windows.ts`) now takes the main-window timers port and a `warn`. When it sends
the guard's question it also sends `executeJavaScript('true')` and arms `RENDERER_LIVENESS_BOUND_MS` (5 000 ms); a probe answered
in time is followed by the next when the bound elapses, and one unanswered at its bound rejects the question with "cannot
answer: unresponsive (no answer to the liveness probe within 5000 ms)", distinct from "gone". It listens `once('unresponsive')`
while the question is out and rejects on it too. Every listener and timer is removed when the question settles, whichever way,
and a late answer is ignored. Main writes at `warn` which signal fired. Both callers pass the port and the warn: the window's
own close guard (`createElectronMainWindowAdapter`) and REQ-SHELL-021's gate 1 (`closeGuard` in `apps/desktop/src/main/index.ts`,
which already mapped a rejection to allow). `closeThroughGuards` (`apps/desktop/src/main/exit.ts`) is unchanged. A renderer
that answers its probes is still waited for without bound.

**Pinned** by `apps/desktop/src/main/main-windows.test.ts` (the block "a main window whose renderer is gone cannot hold its
close or the application's quit", seven cases marked PD-SHELL-010): a probe-silent renderer releases the quit through
`closeThroughGuards` and a person's close at exactly the bound; `unresponsive` releases both; a renderer answering 24 probes in a
row while its guard stays pending is still held; guard (3) is asked after a hung guard (1) on a person's close; listeners and
timers are cleared on all seven settle paths and a late answer changes nothing; a renderer gone before the question arms
nothing. All seven FAIL against the code before the repair.

**Shown** by `pnpm exit-trace-proof`'s new launches `hang` and `hang-close` (the renderer stopped with SIGSTOP; the driver's
`quit`, and the driver's new `closeWindow`, `BrowserWindow.close()`, for a person's close through the host): 27 of 27 checks
PASS on 2026-10-14 under `xvfb-run` on Linux (load average 1.3 to 2.2), each launch exiting 0 through the orderly path about
5.6 s after it was asked (5 643 ms the quit, 5 568 ms the close), with the `warn` line `main window 1: close guard: the renderer
cannot answer: unresponsive (no answer to the liveness probe within 5000 ms); its guard allows (PD-SHELL-010)`. The same proof
against a build without the repair FAILS 8 of 27: both launches held, no exit in 15 s (`held (answered
{"value":{"quitting":true,"how":"quit"}}, no exit in 15 s)`), ended only by the immediate exit.

**Measured, so not built:** the allowed `win.close()` completes on a hung renderer (both launches closed the window and exited
about 0.6 s after the bound), so `guardClose`'s close stays a close; `destroy()` for a window whose guard could not answer was
not needed. **Not decided here:** an answering renderer with unsaved settings still holds a quit from outside any window on a
person's answer ([OQ-298](../../archive/architecture/open-questions/61-spikes-and-later-questions-28.md#oq-298), open).
*Since ruled, 2026-10-14 ([R-072](../../product/requests.md#r-072); fin45, `fin45-supervision-and-quit`): OQ-298's ruling,
[`PD-SHELL-009`](../../product/directives/pd-shell-009.md#pd-shell-009) revision 2, has a quit from outside any window ask no close guard, so
neither an answering nor a hung renderer holds it. `exit-trace-proof`'s `hang` launch now measures that quit exiting 0 well under
the probe's bound (625 ms) with the OQ-298 line and no PD-SHELL-010 `warn` line; `hang-close`, a person's close, remains this
repair's built-app measure (5,567 ms with the `warn` line). The "Shown" paragraph above is kept as it was measured on the day.*
