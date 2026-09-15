## Height estimate counts a collapsed thinking row's hidden body

`packages/ui/src/transcript/pool.ts` `estimateHeight()` estimates from
`row.body.split('\n').length` for every row shape. For a `thinking` row the body is the whole
streamed reasoning text, but under REQ-CHAT-167 (show-reasoning default OFF) only the
one-line `▸ reasoning…` header is drawn. A model that streams a few hundred reasoning lines
gains an estimate of thousands of pixels for a ~30 px header.

The slot offset table positions every row from these estimates, so the live thinking row
claims an enormous vertical span: rows below are pushed off-screen and the span paints as
blank space, and the tail-follow scroll target lands far below the real content. The error
persists for the whole streaming period because a live row is never measured — `reuseKey`
returns null for it (`transcript/cache.ts`) and the slot's `data-measure` key is empty, so the
ResizeObserver cannot correct it until the row settles, when the geometry snaps. The same
error between visible rows reads as unreasonably large spacing.

## Specs

Contradicts **REQ-CHAT-058** only in spirit — the estimate is the documented coarse placeholder —
but the drawing obligation is **REQ-CHAT-057**'s (30 px minimum, margins) and **REQ-CHAT-062**'s
(one summary line while collapsed) together: an estimate for a collapsed thinking row must
estimate what the collapsed row actually draws. The offset table exists to make anchor
restoration exact (REQ-CHAT-071); a per-shape estimate that is wrong by two orders of magnitude
for the fastest-growing row kind defeats that purpose.

## Relevant files

- `packages/ui/src/transcript/pool.ts` — `estimateHeight`; needs the expansion state the
  caller already holds so a collapsed thinking row estimates its header, not its body.
- `packages/ui/src/transcript/TranscriptPane.tsx` — the two call sites that map heights and
  build the measure key.
- `packages/ui/src/transcript/transcript.test.ts` — where a bounded-estimate regression sits.

## Repaired — 2026-09-14 (retrospective record)

The repair landed in commit `71dad83` on `main` (2026-09-13), alongside the sibling defect
`settled-reasoning-row-counts-forever`; this section records what was delivered, which the
note itself did not carry at the time.

**The estimate (`packages/ui/src/transcript/pool.ts`).** `estimateHeight` takes the
expansion state the caller already holds; a collapsed reasoning row estimates its one-line
summary under the REQ-CHAT-057 floor, whatever its hidden body streams, and an expanded
reasoning row keeps the body-based estimate the expansion actually draws.

**The call sites (`packages/ui/src/transcript/TranscriptPane.tsx`).** Both height-mapping
sites pass the expansion state through, so the offset table positions rows against what
the collapsed row draws and the tail-follow target lands on the real content while
streaming.

**Regression.** `packages/ui/src/transcript/transcript.test.ts`: a 300-line hidden body
collapsed estimates under 60 px and at or above the `ROW_MIN_HEIGHT` floor; expanded it
estimates taller than collapsed; non-reasoning shapes are unaffected by the flag.

Verification: the three suites touched by the commit re-run green on `main`
(`engine.test.ts`, `rows.test.ts`, `transcript.test.ts` — 73 tests).
