## The artifact inspector's Markdown editor is not drawn in the monospace face

The inspector's Markdown tab draws its editor in the body's proportional face, and with a vertical resize handle, though
`.artifact-inspector__editor` and the `mono` class both name `--rt-font-mono` and `resize: none`. The adopted stylesheet's
`textarea.input { min-height: 80px; resize: vertical; font-family: inherit }` (`docs/design/system/components.css`) has the
specificity (0,1,1) and outranks both single-class rules (0,1,0), so the editor inherits the dialog's face. Seen by fin43 on
2026-10-14 in `pnpm artifacts-proof`'s `edited.png`: the read-only frontmatter block above the editor is mono, the editor's
"# Travel plan" and "## Key Findings" are not, and the editor's bottom-right corner shows a resize grip. Noticed while drawing
PD-LIBRARY-003 revision 2's read-only block; not repaired.

## Specs

REQ-LIBRARY-132: "the editor uses a measured monospace font so tables and fenced blocks stay aligned while typing".

## Relevant files

- `packages/ui/src/shell.css` — `.artifact-inspector__editor` (font family, `resize: none`) and `.mono`.
- `docs/design/system/components.css` — `textarea.input`, the rule that outranks them.
- `packages/ui/src/library/ArtifactInspector.tsx` — the editor, a design-system `TextArea` with `input artifact-inspector__editor mono`.

## Outcome

Repaired 2026-10-14 by fin44 (`fin44-inspector-and-record`) under REQ-LIBRARY-132. The editor's own rule in
`packages/ui/src/shell.css` is written `.artifact-inspector .artifact-inspector__editor` (0,2,0), which outranks the adopted
`textarea.input` (0,1,1), so its `font-family: var(--rt-font-mono)` and `resize: none` govern; the adopted stylesheet is not
touched. Pinned by `packages/ui/src/library/artifact-inspector-css.test.ts`, which renders the inspector's Markdown tab, matches
every rule of the four sheets `design.css` imports against the editor's markup and ranks them by specificity and order: its
face and resize cases were red on the stylesheet before (`textarea.input`'s `inherit` and `vertical` won). Shown in the built
app by `pnpm artifacts-proof` launch 4, which now reads the editor's computed style at 16.9 s and fails unless its face is the
read-only block's and its resize `none`: at 1360×980 (load average 5.0) both read `"JetBrains Mono", "Cascadia Mono", Menlo,
Consolas, monospace`, the editor at 11 px with `resize: none`; `edited.png` shows the editor's headings in the mono face and
no grip.

**Found along the way, recorded rather than repaired:** the restore confirmation's preview field carries `input mono` too and
meets the same cascade
([`the-restore-confirmations-preview-field-is-not-drawn-in-the-monospace-face.md`](the-restore-confirmations-preview-field-is-not-drawn-in-the-monospace-face.md); repaired by fin45 on 2026-10-14 over the cascade reading this repair made, now `packages/ui/src/css-cascade.ts`, since renamed `packages/ui/src/css-cascade.test-support.ts`).
