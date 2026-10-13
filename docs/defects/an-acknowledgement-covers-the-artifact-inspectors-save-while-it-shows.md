## An acknowledgement covers the artifact inspector's Save while it shows

The artifact inspector (REQ-LIBRARY-131) is a modeless dialog anchored 16 px from the window's bottom-right corner, with
its Save control in its footer. The transient acknowledgement stack (REQ-NOTIFY-012/013) is anchored at the same corner
with the same margins and is drawn over everything. So while an acknowledgement shows, it stands over the inspector's
footer and takes a press meant for Save. A Preview link is the plainest way to meet it: opening the link raises "Opened
in your browser", and for that acknowledgement's lifetime the Save button under it cannot be reached by the pointer.

Met by fin41 on 2026-10-13 while adding a Preview-link press to `pnpm artifacts-proof` launch 4: with the press at 14.3 s,
the press on Save at 17 s logged `"[data-testid="artifact-save"]" is not under the pointer at 1298,939 — "ack__body
text-secondary" is`, and the footer never read "Saved.". The proof now presses the link last. Recorded, not repaired.

## Specs

No requirement's text is contradicted: REQ-NOTIFY-012 anchors the stack at the window's bottom-right and draws it over
all, and REQ-LIBRARY-131 places the inspector at the bottom-right. The two together put a transient surface over a
dialog's primary control. Whether the stack should give way (move, or pass the pointer through to what it covers) is a
question for the two domains, not something either requirement settles.

## Relevant files

- `packages/ui/src/shell.css` — `.ack-stack` (fixed, `right`/`bottom` at `--rt-space-4`, `z-index: 60`) and
  `.artifact-inspector` (fixed, the same insets, `z-index: 40`).
- `packages/ui/src/Acknowledgements.tsx` — the stack and its rows.
- `packages/ui/src/library/ArtifactInspector.tsx` — the inspector and its footer's Save.
- `apps/desktop/scripts/artifacts-proof.mjs` — launch 4, which presses the Preview link after Save for this reason.
