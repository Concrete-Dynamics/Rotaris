## A main window whose renderer hangs holds the application's quit

A main window's close guard is the renderer's, asked by `executeJavaScript` (`askRendererGuard`,
`apps/desktop/src/main/main-windows.ts`). Since 2026-10-14 a renderer that is **gone** (crashed, killed, its contents
destroyed) cannot hold the question: it rejects at once or the moment the renderer goes, and a guard that cannot answer
allows ([`fixed/a-main-window-whose-renderer-crashed-holds-the-applications-quit-forever.md`](fixed/a-main-window-whose-renderer-crashed-holds-the-applications-quit-forever.md)).
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
