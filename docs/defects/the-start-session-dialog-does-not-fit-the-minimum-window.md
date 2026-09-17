## The Start session dialog stands 904 px tall, so it overflows every supported window and its two actions leave the screen

`pnpm ui-audit` measures the dialog at **560 × 904 at (420, 16)** in a 1400 × 900 window — 20 px taller
than the viewport it is centred in — and at **560 × 904 at (220, 16)** in the minimum 1000 × 680 window,
where three controls are measured *off screen* outright:

```
CONTAINMENT overlay: start-session dialog @ 1400x900 — {"box":{"x":420,"y":16,"w":560,"h":904},"viewport":{"w":1400,"h":900}}
CONTAINMENT overlay: start-session dialog @ 1000x680 — {"box":{"x":220,"y":16,"w":560,"h":904},"viewport":{"w":1000,"h":680}}
STACKING    overlay: start-session dialog @ 1000x680 — {"el":".input.select.start-session__select","at":"(off screen)"…}
STACKING    overlay: start-session dialog @ 1000x680 — {"el":".btn.btn-secondary","at":"(off screen)","text":"Cancel"}
STACKING    overlay: start-session dialog @ 1000x680 — {"el":".btn.btn-primary","at":"(off screen)","text":"Start session"}
```

At the minimum window the run-start mode selector, **Cancel** and **Start session** are all outside the
viewport. The dialog is the only way to start a session with a worktree, and at that size there is no way
to accept it and no way to dismiss it with the pointer.

## Specs

REQ-SHELL-022 fixes 1000 × 680 as the minimum window and requires the surfaces to work there;
REQ-SHELL-125 puts the isolation choice, the branch, the sandbox mode and the run-start mode in this one
dialog, which is what made it grow. A modal whose dismissal is off screen also defeats the escape route
every modal owes its user.

## Relevant files

- `packages/ui/src/StartSessionDialog.tsx` — the dialog's sections and its action row.
- `packages/ui/src/shell.css` — `.start-session__*` and the shared `.dialog` geometry (the neighbouring
  dialogs measure 327 and 360 px tall and are clean at both sizes).
- `.ui-audit/` — the evidence pack this was measured from.

Related: `the-start-session-dialog-accepts-and-creates-nothing.md`. The two are separate failures of the
same surface, and the geometry is a plausible contributor to the other: a synthesized click at a control's
computed centre lands nowhere when that centre is outside the window.

Noticed 2026-09-17 by Part AT (`PD-LIBRARY-002`) running `pnpm ui-audit` after drawing its own surfaces.
Not repaired here: the dialog belongs to the session-start path this part does not touch.
