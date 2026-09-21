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
