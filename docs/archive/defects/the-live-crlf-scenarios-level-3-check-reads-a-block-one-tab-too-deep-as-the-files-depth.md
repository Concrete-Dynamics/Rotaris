## The live crlf scenario's level-3 check reads a block one tab too deep as the file's depth

The live run's `crlf` scenario (`apps/desktop/scripts/lib/crlf-scenario.mjs`) checks that a `render.js` window edit landing at
match level 3 put its block at the file's depth. It decides the depth with `render.includes('\t\tif (item.visible) {')`, a
substring test, so a block shifted one tab too deep (`\t\t\tif (item.visible) {`) also contains it and reads as "the file's
depth": a wrong shift passes. The same check does not read the reply: the level-3 expectation the edits proof and
`PD-TOOLS-016`'s record name is `PD-TOOLS-015`'s shift sentence followed by `PD-TOOLS-016`'s CRLF sentence, and a reply missing
either, or carrying them in the other order, passed. Noted by fin43's reviewer of `fin43-rename-and-match`.

## Specs

- [`PD-TOOLS-019`](../../product/directives/pd-tools-019.md#pd-tools-019) and [`PD-TOOLS-015`](../../product/directives/pd-tools-015.md#pd-tools-015) clause 2:
  a level-3 match lands `new_string` shifted to the file's indentation and says so.
- [`PD-TOOLS-016`](../../product/directives/pd-tools-016.md#pd-tools-016): the CRLF sentence, after the shift sentence where both apply.

## Relevant files

- `apps/desktop/scripts/lib/crlf-scenario.mjs` — `crlfVerdicts`, the render.js window edit's depth and level.
- `apps/desktop/scripts/lib/crlf-scenario.test.ts` — the readings, pinned.

## Outcome

Repaired 2026-10-14 (fin44, `fin44-optional-findings`): the depth is read from the block's opening line whole — its leading
whitespace against the fixture's (`\t\t`), one tab less read as "one tab shallow, as given", anything else as "neither" — and a
level-3 landing gains a second check, that its reply carries the shift sentence and, where `new_string` had an LF break, the
CRLF sentence after it. Pinned by `crlf-scenario.test.ts` ("a level-3 block one tab too deep is not the file's depth …"), red on
the reader before the change; the earlier cases are unchanged. What a live run should show: on a level-3 `render.js` landing, both
checks PASS; nothing else moves.
