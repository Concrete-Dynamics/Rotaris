## The restore confirmation's preview field is not drawn in the monospace face

The restore confirmation dialog draws its preview text (`checkpoint-preview-text`) in a design-system `TextArea` with
`input mono checkpoint-dialog__preview`. The adopted `textarea.input { min-height: 80px; resize: vertical; font-family: inherit }`
(`docs/design/system/components.css`, specificity 0,1,1) outranks both `.mono` (0,1,0, in `docs/design/system/base.css` and
`packages/ui/src/shell.css`) and `.checkpoint-dialog__preview` (0,1,0), so the field inherits the dialog's proportional face.
It is the cascade the artifact inspector's Markdown editor met
([`the-artifact-inspectors-markdown-editor-is-not-drawn-in-the-monospace-face.md`](the-artifact-inspectors-markdown-editor-is-not-drawn-in-the-monospace-face.md)),
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
- `packages/ui/src/library/artifact-inspector-css.test.ts` — a cascade reading (rules matched to an element's markup, ranked
  by specificity) that a test for this field could reuse.

## Outcome — repaired 2026-10-14 (fin45, `fin45-seams-ui-and-live`)

**Confirmed in the built app**, not only in the stylesheets: `pnpm checkpoint-proof`'s `restore` launch now reads the preview field's
computed `font-family` while the dialog is up (the eval-at seam, at the dialog shot's 9 000 ms). Over the unrepaired stylesheet it
read `Manrope, system-ui, sans-serif` — the dialog's `--rt-font-body` — and the proof failed there.

**What changed.** `packages/ui/src/shell.css`: the rule is `.checkpoint-dialog .checkpoint-dialog__preview` (0,2,0), which
outranks the adopted `textarea.input` (0,1,1), and it names the face itself, `var(--rt-font-mono)`, rather than leaning on `.mono`
— the shape the artifact inspector's editor took. Size (`--rt-text-sm`), leading, `white-space: pre` and the vertical grip are as
they were. The cascade reading the inspector's test made is now one module, `packages/ui/src/css-cascade.ts` (since renamed `packages/ui/src/css-cascade.test-support.ts`; pure, handed the
sheets), which both tests read.

**Pinned** by `packages/ui/src/checkpoint-dialogs-css.test.ts`: the dialog's own markup (a read-only `textarea.input` carrying
`mono checkpoint-dialog__preview` inside `.checkpoint-dialog`) matched against the four sheets `design.css` imports — the adopted
`textarea.input { font-family: inherit }` is present and reaches the field, and the family that wins is the `--rt-font-mono` token
(red before: `inherit` from `textarea.input` won), with `white-space: pre`, `--rt-text-sm` and the 1.5 leading kept.
`packages/ui/src/library/artifact-inspector-css.test.ts` passes unchanged over the shared module.

**Shown** by `pnpm checkpoint-proof` (2026-10-14, Linux under `xvfb-run`, load 1.7 to 2.0): exit 0, `results.restore.previewFace`
`"JetBrains Mono", "Cascadia Mono", Menlo, Consolas, monospace`, the dialog's `restore-dialog.png` drawing REQ-GIT-064's verb column
aligned; the same proof over the unrepaired `shell.css` exits 1 with "the preview field is drawn in "Manrope, system-ui,
sans-serif", not the monospace face". `pnpm ui-review` was not run: the repair moves one property of one field, and the proof's
computed reading and the dialog PNG are the evidence for it.
