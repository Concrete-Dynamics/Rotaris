## An acknowledgement's close control still covers a corner of the artifact inspector's Save

Since fin43 an acknowledgement takes the pointer only at its close control and its action (REQ-NOTIFY-020), so a press on its
text reaches the inspector's Save beneath it
([`an-acknowledgement-covers-the-artifact-inspectors-save-while-it-shows.md`](an-acknowledgement-covers-the-artifact-inspectors-save-while-it-shows.md)).
The close control itself still stands over part of Save: `pnpm artifacts-proof` launch 4 measured, at 1360×980 with one
acknowledgement showing, the close control at 1319,916 (12×17) and Save at 1270,923 (57×32), an overlap of about 8×10 px at
Save's top-right corner. A press at Save's centre is clear of it; a press at that corner closes the acknowledgement instead.

## Specs

No requirement's text is contradicted. REQ-NOTIFY-012 anchors the stack at the window's bottom-right corner and draws it over
everything; REQ-NOTIFY-020 keeps the close control interactive; REQ-LIBRARY-131 fixes the inspector's size (720×560) and title
but not its place, and the build anchors it at the same corner with the same 16 px insets. Whether the inspector should stand
elsewhere, or the stack lift above an open inspector, is not something either requirement says.

## Relevant files

- `packages/ui/src/shell.css` — `.artifact-inspector` (fixed, `right`/`bottom` at `--rt-space-4`) and `.ack-stack`/`.ack__close`.
- `packages/ui/src/Acknowledgements.tsx` — the stack and its close control.
- `packages/ui/src/library/ArtifactInspector.tsx` — the inspector's footer and Save.
- `apps/desktop/scripts/artifacts-proof.mjs` — launch 4's `ackOverSave` measurement (`closeOverlapsSave`).

## Outcome

Repaired 2026-10-14 by fin44 (`fin44-inspector-and-record`). Neither requirement places the inspector, so the design language
does (`docs/design/README.md` §7: where the specification fixes nothing, the design material decides): its dialogs stand
centred in the window (`.dialog-backdrop`, `place-items: center`, in the adopted `components.css` and the mockup), and the
acknowledgement stack keeps REQ-NOTIFY-012's corner. `.artifact-inspector` in `packages/ui/src/shell.css` is centred
(`inset: 0; margin: auto`, in place of `right`/`bottom` at `--rt-space-4`), still 720×560 and modeless (REQ-LIBRARY-131), and a
window too narrow for it beside a `--rt-space-12` gutter a side gives up the width (`max-width: calc(100vw - 2 *
var(--rt-space-12))`, where it was `100vw - 32px`), so Save stays left of the close control's column at every width down to a
persona window's 560 px minimum (Save's right edge at most W − 64, the close control's left edge at least W − 45). The stack
is still drawn over the inspector (z-index 60 over 40) and its close control still takes the pointer (REQ-NOTIFY-020).

Pinned by `packages/ui/src/library/artifact-inspector-css.test.ts`: it computes Save's right edge and the close control's
widest left edge from what `shell.css` declares at 560, 640, 720, 805, 820, 1000, 1360 and 1920 px, and all eight cases were
red on the stylesheet before (at 1360: Save to 1328, the close control from 1315). Shown in the built app by `pnpm
artifacts-proof` launch 4 (load average 5.0), which now fails if the close control overlaps any part of Save: at 1360×980 with
"Opened in your browser" showing at 16.9 s, the close control stood at 1319,916 (12×17) and Save at 966,729 (57×32), the
acknowledgement (824,907 520×57) overlapped nothing of Save, the press on Save reached it and the footer read "Saved."; the
re-press of "Inspect / edit selected" at 18.6 s (right of the centred dialog, which spans about 320 to 1040; `edited.png`) re-raised the one dialog.
Launch 4 no longer requires the acknowledgement to stand over Save, since the inspector no longer stands under the stack; the
press through an acknowledgement's text stays pinned by `packages/ui/src/acknowledgements.test.ts`. *Added at fin44's review:*
with the press on Save no longer passing through the acknowledgement, launch 4 had lost its built-app reading of REQ-NOTIFY-020,
so it now reads the window's own hit test at the same moment (16.9 s): at the centre of the acknowledgement's text
`elementFromPoint` found the Library's `main` beneath it, not the acknowledgement, and at the close control's centre the
control (load average about 2). Against a build whose `.ack` took the pointer (`pointer-events: auto`) the launch failed on
exactly that reading (`{"text":{"tag":"div","inAck":true}}`).

**Not measured:** a persona window's inspector beside its own acknowledgement in the built app (the unit cases compute 560
and 820 px from the stylesheet); PD-WORKSPACE-001's action, which sits under an acknowledgement's text at its left, against a
centred inspector's Save.
