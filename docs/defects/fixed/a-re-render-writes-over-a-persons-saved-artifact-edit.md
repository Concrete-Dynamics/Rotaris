## A re-render writes over a person's saved artifact edit

A person who edits an artifact in the Library inspector and saves it (REQ-LIBRARY-133) loses the edit the next time the store
re-renders that artifact's document. `ArtifactStore.rerender` (`packages/engine/src/artifacts/store.ts`) writes
`renderSidecar(record)`, a rendering of the record's columns, over the whole file. It runs when a publish or `supersede()` links
the artifact into a supersession (REQ-LIBRARY-095) and when a child report is re-materialised on the same task id
(REQ-LIBRARY-092). In both cases `edited_at` survives, so the Library row and the inspector's metadata line keep saying
` · edited` over a document that no longer holds the edit. No test covered an edit followed by a re-render.

Two smaller faults sit beside it: the follow-up handoff (REQ-SESSION-115, `latestArtifactText` in
`packages/engine/src/sessions.ts`) reads only the record's columns, so a person's correction never reaches the next agent, and
the Key Findings section of the document is written with `.trim()`, which strips the indentation of a published body's first
line (REQ-LIBRARY-093's "unchanged").

Noticed 2026-10-07 by both advocates of the R-072 consortium on OQ-210 and confirmed by its ruling; written by bundle
`fin28-artifacts` before the repair, which builds PD-LIBRARY-003.

## Specs

- REQ-LIBRARY-133: a saved edit persists. A later re-render throws it away.
- REQ-LIBRARY-092: a re-materialisation preserves "the edit timestamp", which only makes sense if the edit survives too.
- REQ-LIBRARY-088: `edited_at` is the record of a person's edit; it stays set over a document that no longer carries one.
- PD-LIBRARY-003 (OQ-210's ruling): a re-render of an edited record rewrites the leading frontmatter only, the handoff carries an
  edited artifact's document, and the Key Findings section drops only blank lines around the body.

## Relevant files

- `packages/engine/src/artifacts/store.ts`: `rerender`, called from `publish` (supersession), `supersede` and
  `materialiseChildReport` (the in-place update).
- `packages/engine/src/artifacts/sidecar.ts`: `renderSidecar`, the Key Findings section's `.trim()`.
- `packages/engine/src/sessions.ts`: `latestArtifactText` and `buildContinuationPayload`, the handoff's text.
- `packages/engine/src/artifacts/artifacts.test.ts`: no case of an edit followed by a re-render.

## Outcome

Repaired 2026-10-07 by bundle `fin28-artifacts`, building [`PD-LIBRARY-003`](../../product/directives.md#pd-library-003)
(OQ-210's ruling under R-072). `ArtifactStore.rerender` now reads a document whose record carries `edited_at` and rewrites only
its leading frontmatter block (`renderFrontmatter`, split out of `renderSidecar`; `splitFrontmatter` in
`packages/contracts/src/artifacts.ts`), or puts a fresh block in front when none remains; a document it cannot read is left as
it is with a warning, and an absent one is written whole. `latestArtifactText` and `buildContinuationPayload` take the
session's `ArtifactStore` and carry an edited artifact's document, frontmatter removed, marked `edited`. The Key Findings
section drops only the blank lines around the body (`trimBlankLines`), so a first line's indentation survives. The inspector's
Preview renders from below the frontmatter (`previewSource`).

Pinned by `packages/engine/src/artifacts/artifacts.test.ts` (`PD-LIBRARY-003 — a re-render keeps a person's edit`: seven of
its nine cases red on the code before, the absent and unedited cases holding the old behaviour), `session-resume.test.ts`
(the handoff case, red before), `packages/contracts/src/artifacts.test.ts` and `packages/ui/src/library/ArtifactInspector.test.ts`.
`pnpm artifacts-proof` (launch 4) now asserts the Preview renders no frontmatter line, and passed; the re-render's survival of an
edit is measured on the real store on disk by the unit tests, not in the built app.
