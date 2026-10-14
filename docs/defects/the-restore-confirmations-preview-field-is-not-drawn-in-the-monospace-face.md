## The restore confirmation's preview field is not drawn in the monospace face

The restore confirmation dialog draws its preview text (`checkpoint-preview-text`) in a design-system `TextArea` with
`input mono checkpoint-dialog__preview`. The adopted `textarea.input { min-height: 80px; resize: vertical; font-family: inherit }`
(`docs/design/system/components.css`, specificity 0,1,1) outranks both `.mono` (0,1,0, in `docs/design/system/base.css` and
`packages/ui/src/shell.css`) and `.checkpoint-dialog__preview` (0,1,0), so the field inherits the dialog's proportional face.
It is the cascade the artifact inspector's Markdown editor met
([`the-artifact-inspectors-markdown-editor-is-not-drawn-in-the-monospace-face.md`](the-artifact-inspectors-markdown-editor-is-not-drawn-in-the-monospace-face.md), open when this was written),
read from the stylesheets; it was not seen in the built app. Noticed by fin44 on 2026-10-14 while repairing the inspector's
editor, which looked for every other `textarea` carrying `mono`; outside that task, so recorded and not repaired. The preview
text of REQ-GIT-064 aligns its paths after a 9-character verb column, which a proportional face does not keep.

## Specs

REQ-GIT-097: "the restore preview text of REQ-GIT-064 in a read-only monospace field". REQ-GIT-152 names that monospace field
among the visual properties that hold.

## Relevant files

- `packages/ui/src/CheckpointDialogs.tsx` — the field, `<DesignTextArea className="input mono checkpoint-dialog__preview" …>`.
- `packages/ui/src/shell.css` — `.mono` and `.checkpoint-dialog__preview` (no `font-family` of its own).
- `docs/design/system/components.css` — `textarea.input`, the rule that outranks them.
- the inspector editor's repair adds a cascade reading (rules matched to an element's markup, ranked
  by specificity) that a test for this field could reuse.
