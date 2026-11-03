# `layout-proof`

What this proof measures and re-verifies. The [proof registry](README.md) carries its area, prerequisites,
platforms, flags and neighbours; the script is [`apps/desktop/scripts/layout-proof.mjs`](../../apps/desktop/scripts/layout-proof.mjs).

The Workspace view's grid, **measured** at the sizes the specification names, a task whose text is one unbroken token kept inside the plan column (REQ-SHELL-022), and (section 7) the status strip's path link shortened from the middle at 1180 px under a deep workspace path, its head and folder name kept with one `…`, unclipped, the short branch name `main` beside it drawn whole, and re-measured at 1400 px (REQ-WORKSPACE-149 rule 2; `docs/archive/defects/the-status-strips-workspace-path-elides-at-its-end-not-its-middle.md`)

*2026-11-04:* step 4 waits for the wide layout after the resize back to 1400×900 (`until`, bounded at 10 s) instead of
reading it at a fixed 700 ms: that offset read a false red in a landing's run under a host at 97 % CPU, green alone on the same
head ([the note](../archive/defects/layout-proofs-wide-layout-return-reads-the-narrow-class-at-a-fixed-700-ms-after-the-resize.md)).
