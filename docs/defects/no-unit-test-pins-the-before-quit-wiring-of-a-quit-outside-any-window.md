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

None contradicted: the product does what `PD-SHELL-009` revision 2 ([OQ-298](../architecture/open-questions.md#oq-298)) and
`PD-ORCH-005` clause 9 require, as `exit-trace-proof` shows. The gap is that what keeps it so is measured only after a build.

## Relevant files

- `apps/desktop/src/main/index.ts` — the inline `app.on('before-quit', …)` handler (`guardsAsked`, the open-window filter,
  the two `quit:` log lines, `quitGuardsOutsideAnyWindow(…, closeGuards)` fed to `closeThroughGuards`).
- `apps/desktop/src/main/exit.ts` — `closeThroughGuards` and `quitGuardsOutsideAnyWindow`, the unit-tested pieces.
- `apps/desktop/src/main/exit.test.ts` — the OQ-298 cases, which test the pieces and not the handler.
- `apps/desktop/scripts/exit-trace-proof.mjs` — the built-app launches that alone reach the handler.
