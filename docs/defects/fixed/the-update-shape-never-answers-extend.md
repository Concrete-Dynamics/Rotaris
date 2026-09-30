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

Noticed 2026-09-29; recorded, not repaired, in the round that found it — the classification's label was outside that round. Repaired since: see the outcome below.

## Outcome

Repaired 2026-09-29 under R-067. `updateShape` now answers `extend` where every row before the update kept its identity,
rows were appended after them, and the last of them draws something else than it did: the same keys with the last row's
content changed. The keys cannot see that difference — a row extended in place keeps its key by REQ-CHAT-059 — so the
content is read for that one row only (`changedInPlace` in `pool.ts`: the same object, or the same underlying row, is
unchanged without reading its text, since the replica replaces a changed row rather than mutating it; otherwise the two
rows' `sourceTextOf` are compared, which is what a group, rebuilt on every projection, needs). The unreachable `extend`
branch is gone. The cost stays that of the rows the update changed (REQ-CHAT-055): the bounded-read case beside it still
reads at most four keys for one appended row at 1,200. An extension with nothing appended after it stays `replace` —
the same number of rows replaced in place — and a change inside an earlier row while rows are appended stays `append`, as
it was: the classification is by the four shapes the requirement names, and no restoration depends on it.

Pinned in `packages/ui/src/transcript/transcript.test.ts`: "REQ-CHAT-053: the four update shapes are told apart" now
asserts `extend` for a streamed row that grew with a tool row after it and for a group that gained a member with a row
after it, and `append` for the same shapes with the last row unchanged (the same object, and a new object with the same
content); the seeded comparison gains an operation that grows the last row and appends, its oracle is the first form's
answer with `append` split by the last row's content, and it now sees all five answers. Both fail on the first form
(`expected 'append' to be 'extend'`). The pane still records the shape on the element (`data-shape`) and still branches
on nothing, so what the reader sees is unchanged.
