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
