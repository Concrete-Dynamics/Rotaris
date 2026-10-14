## The quit log says it closes through close guards beside saying none is asked

A quit Electron starts on its own account (SIGTERM, the driver's or the capture's `app.quit()`) writes two adjacent lines to
`app.log`:

```
quit: closing 1 main window(s) through their close guards first (PD-ORCH-005 clause 9)
quit: started outside any window; no close guard is asked, and unsaved settings, if any, stay unsaved (OQ-298)
```

Read in sequence they contradict each other: the first says the windows close through their close guards, the second that no
close guard is asked. Both are true of different things. The windows do close through their own `CloseGuard`s' `confirm` and
`close` (PD-ORCH-005 clause 9's all-or-none order, whose line fin45 kept as its brief required), but since
[OQ-298](../../architecture/open-questions.md#oq-298)'s ruling each guard allows at once: neither the renderer's unsaved-settings
question nor PD-SHELL-009's active-run confirmation is put. The second line says "no close guard is asked" where it means
"no question is put". Every live run's quit block shows the pair. Found as a fin45 reviewer's optional finding
(supervision-and-quit, Task 2) and carried by fin46's acceptance round 1 (C4).

## Specs

None contradicted in behaviour. The log line misdescribes what `PD-SHELL-009` revision 2 (OQ-298) and `PD-ORCH-005` clause 9
have the quit do, so a reader of the log (a person, or the live run's autopsy) is told two things that read as opposed.

## Relevant files

- `apps/desktop/src/main/index.ts` — the `before-quit` handler, which writes both lines.
- `apps/desktop/scripts/exit-trace-proof.mjs` — `OQ298_LINE`, the exact second line its `hang`, `unsaved-quit` and
  `unsaved-sigterm` launches require.
- `docs/architecture/views/02-process-view.md` and `docs/product/directives.md` (`PD-SHELL-009` revision 2's first execution)
  — quote the second line.

## Outcome (2026-10-14, fin46 `fin46-accept1-8`, Task 2)

Repaired by rewording the second line; clause 9's line, which fin45's brief required kept, is unchanged, and so is the
behaviour. `QuitOutsideAnyWindow.beforeQuit` (`apps/desktop/src/main/exit.ts`, where the handler sits since Task 1 of the same
round) now writes:

```
quit: closing 1 main window(s) through their close guards first (PD-ORCH-005 clause 9)
quit: started outside any window; each close guard allows without a question, so no Save/Discard/Cancel or active-run box is shown, and unsaved settings, if any, stay unsaved (OQ-298)
```

The windows close through their close guards, and those guards put no question: the two lines now say the same thing from two
sides. `index.ts`'s comment says "no close guard puts a question" for the same reason.

**Pinned by** `apps/desktop/src/main/exit.test.ts` (OQ-298 block): "the two quit lines agree" fails on any line saying "no close
guard", and the held-quit case pins both lines exactly; both were red on the old wording. **Shown in the built app:**
`exit-trace-proof`'s `OQ298_LINE` is the new line, and `pnpm exit-trace-proof` read 37 of 37 (load 1.5 to 1.6 on 4 CPUs), its
`hang` launch's `app.log` holding the two lines above; `hang`, `unsaved-quit` and `unsaved-sigterm` exited 0 in 636 ms, 103 ms
and 81 ms. The process view and `PD-SHELL-009` revision 2's first-execution report carry the new wording, the report keeping
the old one beside it.
