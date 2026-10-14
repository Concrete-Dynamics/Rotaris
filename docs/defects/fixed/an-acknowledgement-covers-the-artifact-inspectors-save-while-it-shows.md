## An acknowledgement covers the artifact inspector's Save while it shows

The artifact inspector (REQ-LIBRARY-131) is a modeless dialog anchored 16 px from the window's bottom-right corner, with
its Save control in its footer. The transient acknowledgement stack (REQ-NOTIFY-012/013) is anchored at the same corner
with the same margins and is drawn over everything. So while an acknowledgement shows, it stands over the inspector's
footer and takes a press meant for Save. A Preview link is the plainest way to meet it: opening the link raises "Opened
in your browser", and for that acknowledgement's lifetime the Save button under it cannot be reached by the pointer.

Met by fin41 on 2026-10-13 while adding a Preview-link press to `pnpm artifacts-proof` launch 4: with the press at 14.3 s,
the press on Save at 17 s logged `"[data-testid="artifact-save"]" is not under the pointer at 1298,939 — "ack__body
text-secondary" is`, and the footer never read "Saved.". The proof then pressed the link last. Recorded, not repaired
(until fin43; Outcome below).

## Specs

No requirement's text is contradicted: REQ-NOTIFY-012 anchors the stack at the window's bottom-right and draws it over
all, and the inspector stands at the bottom-right (*corrected 2026-10-14: REQ-LIBRARY-131 fixes the inspector's size and
title, not its place; the corner is the build's, `.artifact-inspector` in `shell.css`*). The two together put a transient surface over a
dialog's primary control. Whether the stack should give way (move, or pass the pointer through to what it covers) is a
question for the two domains, not something either requirement settles.

## Relevant files

- `packages/ui/src/shell.css` — `.ack-stack` (fixed, `right`/`bottom` at `--rt-space-4`, `z-index: 60`) and
  `.artifact-inspector` (fixed, the same insets, `z-index: 40`).
- `packages/ui/src/Acknowledgements.tsx` — the stack and its rows.
- `packages/ui/src/library/ArtifactInspector.tsx` — the inspector and its footer's Save.
- `apps/desktop/scripts/artifacts-proof.mjs` — launch 4, which pressed the Preview link after Save for this reason (before
  the save since fin43).

## Outcome

Repaired 2026-10-14 by fin43 (`fin43-analysis-and-artifacts`) under REQ-NOTIFY-020's "Only the close control accepts
interaction": an acknowledgement's box takes no pointer (`.ack { pointer-events: none }` in `packages/ui/src/shell.css`, where
it read `auto`), and only its close control and PD-WORKSPACE-001's one action take it (`pointer-events: auto`). A press on its
text now reaches what it is drawn over, the inspector's Save among them, while the stack is still drawn over everything
(REQ-NOTIFY-012). Pinned by `packages/ui/src/acknowledgements.test.ts` (two of its three cases red on the stylesheet before).
Shown in the built app by `pnpm artifacts-proof` launch 4, which now presses the Preview's link BEFORE the save: at 16.9 s the
acknowledgement "Opened in your browser" stood over Save (ack 824,907 520×57; Save 1270,923 57×32, at 1360×980), the press on
Save at 17 s reached it and the footer read "Saved.".

**What remains, recorded rather than repaired:** the acknowledgement's close control (1319,916 12×17) still overlaps Save's
top-right corner by about 8×10 px, since REQ-NOTIFY-020 keeps it interactive; a press at Save's centre is clear of it, a press at
that corner closes the acknowledgement. Recorded as
[`../an-acknowledgements-close-control-still-covers-a-corner-of-the-artifact-inspectors-save.md`](../an-acknowledgements-close-control-still-covers-a-corner-of-the-artifact-inspectors-save.md).

