## An acknowledgement's close control still covers a corner of the artifact inspector's Save

Since fin43 an acknowledgement takes the pointer only at its close control and its action (REQ-NOTIFY-020), so a press on its
text reaches the inspector's Save beneath it
([`fixed/an-acknowledgement-covers-the-artifact-inspectors-save-while-it-shows.md`](fixed/an-acknowledgement-covers-the-artifact-inspectors-save-while-it-shows.md)).
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
