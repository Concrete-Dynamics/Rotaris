## A title holding a Unicode line separator writes a frontmatter the splitter does not read as a block

`renderFrontmatter` (`packages/engine/src/artifacts/sidecar.ts`) writes each value through `yamlScalar`, which is
`JSON.stringify`, and `JSON.stringify` leaves U+2028 (LINE SEPARATOR) and U+2029 (PARAGRAPH SEPARATOR) raw. `splitFrontmatter`
(`packages/contracts/src/artifacts.ts`) accepts a line between the fences only when it matches `FRONTMATTER_LINE`, which ends in
`(?:[ \t].*)?$` without the `s` flag; `.` matches neither character, so a `title: "…"` line holding one fails the test and the
whole text is read as having no block. A re-render of an edited artifact whose title holds one then finds no frontmatter to
replace and writes a new block above the document, one more on every re-render, and the inspector's Preview renders the block
it no longer recognises. Noticed by fin28's reviewers; recorded by fin30 before the repair.

## Specs

PD-LIBRARY-003 (d) and (f): a re-render of a document a person edited rewrites its leading frontmatter alone, and the Preview
renders from below it. A frontmatter this product wrote itself must be one its own splitter reads as a block.

## Relevant files

- `packages/contracts/src/artifacts.ts` — `FRONTMATTER_LINE` and `splitFrontmatter`.
- `packages/engine/src/artifacts/sidecar.ts` — `yamlScalar`, `renderFrontmatter`.
- `packages/engine/src/artifacts/store.ts` — `rerender`, which adds a block when the split finds none.
