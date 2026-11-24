## requirements-proof's fold stage depends on the launched window holding OS focus

`requirements-proof`'s `fold` stage presses the Done column's heading with a real mouse event
(`ROTARIS_CAPTURE_CLICKS`, `sendInputEvent` mouseDown/mouseUp) and then reads that the focus moved to the folded rail
(REQ-TRACE-320). Chromium moves focus on mousedown only in a page whose window holds OS focus. On this Linux host (X11,
2026-11-22) the stage's freshly launched window sometimes does not: instrumented with a capture-phase event log, a failing
run read `document.hasFocus() === false` from before the press, then `pointerdown`, `mousedown`, `mouseup` and `click` on
`BUTTON.req-column__heading` at its centre, and **no `focusin` at all** — the heading never took focus, so the fold's
hand-off (`Column.tsx`, `hadFocus`) correctly had nothing to hand to the rail, and the stage read `body`. A passing run of
the same build read `hasFocus() === true` and `focusin` on the heading, then the rail.

Measured on the branch of R-122..R-124 (header, survey progress, card facts): 4 of 8 runs red at this stage; on `main`
(`7fec7382`) 3 of 3 green. No change on the branch touches the fold, the column or window focus, and the red reproduces
with the instrument showing the window unfocused, so the red is read as the host's window focus, not the product. Why the
branch's runs met an unfocused window more often than `main`'s three is not established (a hypothesis not tested: the
real pointer resting over one of the header's new `title`-bearing statements, whose native tooltip window takes the
launched window's focus).

`theme-proof`'s `focus` item failed on the same host at the same scales on `main` and on the branch, for the same cause;
`main` repaired that one separately (43c72df2).

**Repaired 2026-11-24.** The scriptable capture seams hold their page focused before the first step
(`apps/desktop/src/main/page-focus.ts`, the DevTools protocol's `Emulation.setFocusEmulationEnabled`; called from
`capture/index.ts`), the capture-side counterpart of the driver's `emulateFocus` that fixed `theme-proof`'s focus section
on `main` (43c72df2). Measured 2026-11-22 to 24: in twelve runs with the hold, none read the focus off the rail (REQ-TRACE-320). One met a
different red in the same stage, the press folding no column at all ("left 0 rail(s)"), a shape also met without the hold.
That one and the reds the runs met at later stages (REQ-TRACE-365, -375/376, -397, -426) came alike from builds with and
without the hold, so they are not this note's.

## Specs

None contradicted by the product. The proof's reading of REQ-TRACE-320 assumes a focused window; a press in an unfocused
window cannot meet it. A repair is the harness's: give the launched window focus before the stage's first press
(`win.focus()` in the capture host, or a `focus` step), and record `document.hasFocus()` beside the reading so a red
says which of the two it is.

## Relevant files

- `apps/desktop/scripts/requirements-proof.mjs` — the `fold` launch and its REQ-TRACE-320 assertion.
- `apps/desktop/src/main/capture/host.ts` — `clickAt`, the press without a focus step.
- `packages/ui/src/requirements/Column.tsx` — `hadFocus` and the fold's focus hand-off (behaves as written).
