## No unit test pins the before-quit wiring of a quit outside any window

`apps/desktop/src/main/index.ts`'s `before-quit` handler is what turns a quit Electron starts on its own account (SIGTERM, a
desktop logout where Electron emits `before-quit`, the driver's or the capture's `app.quit()`) into the main windows' close:
it holds the quit while any main window is open and not already closing, starts the all-or-none close once
(`closeThroughGuards` over `quitGuardsOutsideAnyWindow`'s guards, which ask no renderer), holds a second `before-quit` while
that close is under way, and lets the quit `window-all-closed` starts afterwards go ahead. The two pieces it composes are
unit-tested in `exit.test.ts`, but the handler itself is inline code in the composition root: its open-window filter, its
`event.preventDefault()`, its once-only flag and its choice of `quitGuardsOutsideAnyWindow` over the windows' own
`CloseGuard`s are reached by no unit test. Only `exit-trace-proof`'s `hang`, `unsaved-quit` and `unsaved-sigterm` launches
cover them, after a build. A regression there (the handler wiring the windows' own `CloseGuard`s again, as before OQ-298, or
dropping the once-only flag) would pass `pnpm check` and show only in a proof. Found as a fin45 reviewer's optional finding
(supervision-and-quit, Task 2) and carried by fin46's acceptance round 1 (C3).

## Specs

None contradicted: the product does what `PD-SHELL-009` revision 2 ([OQ-298](../../archive/architecture/open-questions/61-spikes-and-later-questions-28.md#oq-298)) and
`PD-ORCH-005` clause 9 require, as `exit-trace-proof` shows. The gap is that what keeps it so is measured only after a build.

## Relevant files

- `apps/desktop/src/main/index.ts` — the inline `app.on('before-quit', …)` handler (`guardsAsked`, the open-window filter,
  the two `quit:` log lines, `quitGuardsOutsideAnyWindow(…, closeGuards)` fed to `closeThroughGuards`).
- `apps/desktop/src/main/exit.ts` — `closeThroughGuards` and `quitGuardsOutsideAnyWindow`, the unit-tested pieces.
- `apps/desktop/src/main/exit.test.ts` — the OQ-298 cases, which test the pieces and not the handler.
- `apps/desktop/scripts/exit-trace-proof.mjs` — the built-app launches that alone reach the handler.

## Outcome (2026-10-14, fin46 `fin46-accept1-8`, Task 1)

Repaired by moving the handler out of the composition root, unchanged in behaviour. `QuitOutsideAnyWindow`
(`apps/desktop/src/main/exit.ts`) is the handler: its `beforeQuit()` answers whether the quit is held, holds it while a main
window is open and not already closing, starts the all-or-none close once over `quitGuardsOutsideAnyWindow`'s guards, holds a
second `before-quit` while that close is under way, and lets a quit with no main window open go ahead. `index.ts` builds it
over `mainWindows.ordered()` filtered to the open, not-closing windows (fallback confirm `quit.closeConfirmed`, fallback close
`win.close()`) and `closeGuards`, and its `before-quit` is one line: `if (quitOutsideAnyWindow.beforeQuit()) event.preventDefault();`.

**Pinned by** four cases in `apps/desktop/src/main/exit.test.ts`, in the OQ-298 block: over two windows whose renderer guard
never settles, `beforeQuit()` is held, asks no renderer, confirms both before closing both, and the quit after the last close is
not held; a second `before-quit` under way starts nothing more; no open window is not held and logs nothing; and a source-shape
case pins `index.ts`'s wiring (the one holding `before-quit` handler, the filter, the fallbacks, `closeGuards`). Each was shown
red on the regression it guards: `index.ts` restored to its inline handler (the wiring case fails), the once-only check removed
(the second-quit case fails), and the handler fed the windows' own `CloseGuard`s, the shape before OQ-298 (two cases fail,
held on the renderer's guard). **Shown in the built app:** `pnpm exit-trace-proof`, 37 of 37 (load 3.0 to 4.3 on 4 CPUs):
`hang` exited 0 in 683 ms with the OQ-298 line and no PD-SHELL-010 warn line, `unsaved-quit` and `unsaved-sigterm` in 136 ms
and 109 ms with the workspace configuration file byte-identical.
