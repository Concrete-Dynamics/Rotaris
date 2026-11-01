[Product directives](../directives.md) › PD-SHELL-010

<a id="pd-shell-010"></a>

### PD-SHELL-010 — a main window's renderer that is gone or does not answer a liveness probe cannot answer its close guard, and a guard that cannot answer allows

A main window's close guard (REQ-SHELL-119 guard (1), the renderer's unsaved-settings guard, REQ-SHELL-124) is asked of the
window's renderer. That renderer **cannot answer** the guard when any of these holds while the guard's question is out:

- **it is gone** — its process crashed or was killed, or its contents were destroyed, before the question was sent or while it
  was out;
- **it fails main's liveness probe** — main sends the renderer a trivial question of its own when it sends the guard's question,
  and again each time `RENDERER_LIVENESS_BOUND_MS` (5,000 ms) elapses with the previous one answered; a probe left unanswered at
  that bound fails;
- **Chromium emits `unresponsive`** for the renderer's contents.

**A guard that cannot answer allows**: the close or the quit proceeds without guard (1). Main writes at `warn` which signal it
was. Nothing else changes:

- a **person's close** of the window still meets guard (3)'s native active-run box, as `PD-SHELL-009` narrows REQ-SHELL-119 (the
  box is main's, not the renderer's, and is asked as before);
- a **quit that starts outside any window** (`PD-SHELL-009`'s last case) asks nothing more — *amended 2026-10-14 (OQ-298,
  `PD-SHELL-009` revision 2): such a quit asks no close guard at all, so this directive does not reach it; it reaches a person's
  close of a window and REQ-SHELL-021 gate (1) alone.* The bullet first read, and no longer governs: "a **quit that starts
  outside any window** (`PD-SHELL-009`'s last case) asks nothing more;";
- a renderer that **answers the probe** is waited for **with no bound**, because its guard is a person's Save/Discard/Cancel,
  which no time may answer for;
- REQ-SHELL-021 gate (1) asks the same question on the same terms: a renderer that cannot answer passes gate (1), and gates (2)
  and (3) are evaluated as written.

It adds no dialog and no string. Every listener and timer the question arms is removed when the question settles, whichever way
it settles, and a late answer is ignored.

**As built.** `askRendererGuard` and `RENDERER_LIVENESS_BOUND_MS` (`apps/desktop/src/main/main-windows.ts`), over the main-window
timers port; asked by the window's own close guard (`guardClose`, wired in `createElectronMainWindowAdapter`) and by main's
`closeGuard` for REQ-SHELL-021's gate 1 (`apps/desktop/src/main/index.ts`). *Amended 2026-10-14 (OQ-298):* the application's quit
no longer asks it — `closeThroughGuards` (`apps/desktop/src/main/exit.ts`) is fed `quitGuardsOutsideAnyWindow`'s guards, which take
only each window's `confirm` and `close`. First written, and no longer true: "The application's quit drives the same guard through
`closeThroughGuards` (`apps/desktop/src/main/exit.ts`), unchanged."

**Why, and what it costs.** OQ-297 (the consortium's HR1), ruled 2026-10-14 under the owner's delegation (R-072). Before it, a
renderer that was alive but hung held a person's close of its window and the application's quit — a SIGTERM's included — with no
answer and no bound ([`a-main-window-whose-renderer-hangs-holds-the-applications-quit.md`](../../defects/fixed/a-main-window-whose-renderer-hangs-holds-the-applications-quit.md)).
A bound on the guard's question itself would answer for a person deciding; a bound on a question that needs no person does not.
The gone case was built by fin43 on 2026-10-14 without a directive
([`a-main-window-whose-renderer-crashed-holds-the-applications-quit-forever.md`](../../defects/fixed/a-main-window-whose-renderer-crashed-holds-the-applications-quit-forever.md));
this directive is its record home. What it costs: a renderer busy for more than 5 s on its main thread while its window is being
closed — a long synchronous task, not a person deciding — loses its guard, so unsaved settings in it are not offered for saving;
and an answering renderer with unsaved settings still holds a quit from outside any window on a person's answer
([OQ-298](../../archive/architecture/open-questions/61-spikes-and-later-questions-28.md#oq-298), raised apart, not decided here). *Amended 2026-10-14: OQ-298 is ruled
(`PD-SHELL-009` revision 2) — such a quit asks no guard, so an answering renderer no longer holds it; its unsaved settings stay
unsaved and are not written.* This directive's cases are disjoint from
`PD-SHELL-009`'s (guard (3) and gate (3)'s count) and from `PD-SHELL-001`'s (the add-a-window gestures, on which no gate is
evaluated): it narrows only guard (1) and gate (1), when the renderer cannot answer. *Noted 2026-10-20 ([OQ-361](../../archive/architecture/open-questions/63-spikes-and-later-questions-30.md#oq-361), `PD-SHELL-009` revision 3): since revision 3, `PD-SHELL-009`'s cases are guard (2) and gate (2) too, beside guard (3) and gate (3)'s count; this directive's stay disjoint from them.*

> **Narrows:** REQ-SHELL-119, REQ-SHELL-124, REQ-SHELL-021

*Raised by the consortium under the owner's delegation, 2026-10-14; logged as [R-072](../requests.md#r-072), the ruling of
[OQ-297](../../archive/architecture/open-questions/60-spikes-and-later-questions-27.md#oq-297) (HR1; advocate B followed, one point from advocate A folded in).*

> **First execution, 2026-10-14, built by fin44 (`fin44-hang-and-seams`):** the directive held as written. `askRendererGuard`'s
> probe, its bound and the `unresponsive` listener were built as stated; `main-windows.test.ts` pins seven cases, all red on the
> source before the change. `pnpm exit-trace-proof`'s `hang` and `hang-close` launches stopped the main window's renderer with
> SIGSTOP: the driver's quit and the host's close (`BrowserWindow.close()`, the driver's `closeWindow`) each ended the process,
> exit 0, through the orderly path about 5.6 s after they were asked, and main wrote the `warn` line naming the probe; against
> the build before the change both were held with no exit in 15 s. **What the ruling's implementation left to measurement:**
> whether the allowed `win.close()` completes on a hung renderer — it does, so the close was not turned into `destroy()`. Chromium's
> `unresponsive` did not fire in either launch (a stopped renderer with no input pending earns none): the probe alone released
> them, and the second signal is pinned by the unit cases only. **Not measured:** a renderer hung by a busy main thread rather
> than a stopped process (the same probe; no proof loops a renderer); a Windows or macOS host. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).
