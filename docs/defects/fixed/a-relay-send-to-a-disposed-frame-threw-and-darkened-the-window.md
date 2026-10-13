## A relay send to a disposed render frame threw and the window went dark grey

Observed 2026-09-21, run `1ddeb71b` (NodeGrade, `v1-7e814b4aba02273c0589405a68a5fc5c`): the main window went dark grey mid-run. The main-process log shows `Error sending from webFrameMain: Error: Render frame was disposed before WebFrameMain could be accessed`, thrown from `WebContents.send` inside the relay sink, reached via `UpdateRelay.relaySequenced` from a run-host `publish` event. The sink guard checks `win.isDestroyed()` only, which a disposed frame passes. Neither `relaySequenced` nor `broadcast` guards or isolates per-sink failures, so one dead sink throws inside the run-host event handler instead of being shed. The `render-process-gone` handler only releases modality; nothing detaches the dead sink. The session survived in the store (`running`, thinking row 735 unsettled, `wait_for_tasks` ord 317 still `running`), but the live view and control of it were lost with the window.

## Specs

REQ-MONITOR-226 — a view consumer that vanishes must leave the run untouched. Read from the main side: a vanished view should be dropped from the fan-out, not throw on the publication path. No spec sentence obliges the relay to shed a dead sink; recorded as contradicting 226's intent on the delivery path (ADR-0044's fan-out).

## Relevant files

- `packages/shell/src/relay.ts` — `relaySequenced`/`broadcast` send with no per-sink guard or isolation.
- `apps/desktop/src/main/index.ts` — `relayAttach` guards `isDestroyed()` only, which a disposed frame passes.
- `apps/desktop/src/main/main-windows.ts` — `render-process-gone` releases modality only; no detach.
- `packages/shell/src/process-link.ts` — event listeners fire with no isolation, so a throw propagates to the emitter.

Noticed 2026-09-21 by the run-autopsy of run `1ddeb71b`.

## Repaired — 2026-09-21, `3360bce` (recorded here 2026-10-13, fin41)

The note was moved to `fixed/` by `0c543f5` ("repaired by shed-on-throw") with no repair written on it; the text above
describes the state before the repair. The repair is `3360bce`, "fix(relay): shed dead sinks instead of throwing on a
disposed frame (REQ-MONITOR-226)":

- `packages/shell/src/relay.ts` — `relaySequenced` and `broadcast` catch a sink whose `send` throws, detach it and keep
  delivering to the others.
- `apps/desktop/src/main/main-windows.ts` — `render-process-gone` detaches the window's sink from the relay and the
  terminal-frame limiter, and logs it.
- `apps/desktop/src/main/index.ts` — `relayAttach`'s sink also checks `win.webContents.isDestroyed()`.
- `packages/shell/src/process-link.ts` — one throwing event listener no longer stops dispatch to the rest.
- `apps/desktop/src/main/terminal.ts` — channel 3's send sheds a dead window from the relay and the limiter alike.

Tests, added in the same commit: `packages/shell/src/shell.test.ts` "a dead sink is shed, not thrown: the survivors
still get the publication (REQ-MONITOR-226 intent)", "broadcast sheds a dead sink and keeps delivering to the rest" and
"a throwing event listener does not break dispatch to the rest"; `apps/desktop/src/main/terminal.test.ts` "a window whose
sink throws is shed from the relay and the limiter; the survivor keeps its frames".
