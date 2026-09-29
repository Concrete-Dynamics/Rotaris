## The update shape never answers `extend`

REQ-CHAT-053 names four shapes an update may take — appending rows, dropping rows from the end, replacing rows in place,
and extending the last streamed row while appending after it — and `updateShape` in `pool.ts` is meant to tell them
apart. It never answers `extend`. It compares displayed-row KEYS, and a last row extended in place keeps its key, so an
extension with rows appended after it reads as a plain `append`; the branch written for `extend` requires the last key
to be both the first one that differs (`common === before.length - 1`) and equal on both sides, which cannot hold at once.

Nothing the reader sees depends on it: the pane runs the same restoration whatever the shape was and records the shape on
the element (`data-shape`) rather than branching on it, so REQ-CHAT-053's position and expansion guarantees hold for an
extension as they do for an append. What is wrong is the verification label, and the unit test titled "the four update
shapes are told apart" asserts three of them.

Found 2026-09-29 while rewriting `updateShape` to compare keys only past the rows the two arrays share (REQ-CHAT-055's
CPU-profile round): the rewrite keeps the old answer exactly, the unreachable branch included, and its seeded comparison
with the first form sees `append`, `truncate`, `replace` and `other`, never `extend`.

## Specs

`REQ-CHAT-053` — the fourth shape is named by the requirement and never classified as itself. No behaviour the requirement
states is violated, because the restoration does not depend on the classification.

## Relevant files

- `packages/ui/src/transcript/pool.ts` — `updateShape`.
- `packages/ui/src/transcript/TranscriptPane.tsx` — the layout effect that records `data-shape`.
- `packages/ui/src/transcript/transcript.test.ts` — "REQ-CHAT-053: the four update shapes are told apart", and the seeded
  comparison that shows which shapes are reachable.

Noticed 2026-09-29; recorded, not repaired — the classification's label is outside the round that found it.
