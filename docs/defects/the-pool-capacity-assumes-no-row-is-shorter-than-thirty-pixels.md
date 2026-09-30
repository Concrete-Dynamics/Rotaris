## The pool's capacity assumes no row is shorter than 30 px, and PD-CHAT-003 draws rows shorter than that

`POOL_CAPACITY` (`packages/ui/src/transcript/constants.ts`) is `ceil(H_MAX / ROW_MIN_HEIGHT) + OVERSCAN` — 144 slots for
the 4,320 px declared maximum viewport, plus 10 — and `visibleRange` (`packages/ui/src/transcript/pool.ts`) says a span
wider than the pool "cannot happen while the viewport is inside `H_MAX` (REQ-CHAT-057's 30 px floor bounds the span by the
capacity)". PD-CHAT-003 lifted that floor from the row's box: a row sizes to its content, and its own text says "real rows
may be shorter". By the stylesheet a one-line row inside a block is `.row`'s 4 px margin, a 1 px border either side and
one line (19.5 px at `--rt-text-sm` and a 1.5 line height): about 25.5 px — computed, not measured. A viewport of such rows
taller than about 144 × 25.5 ≈ 3,670 px shows more rows than the pool binds after its overscan: `visibleRange` clamps
`last` to `first + capacity - 1`, and the rows below that are not drawn — blank space at the bottom of the transcript,
inside `H_MAX`, where the growth branch (`capacityFor`) is never taken. A portrait 4K panel at a scale factor of 1 is such
a viewport.

The constant's own comment calls 30 px PD-CHAT-003's "conservative unit" for the slot arithmetic; for capacity, a unit
LARGER than the shortest row is the opposite of conservative. Noticed 2026-09-29 while repairing
`fixed/a-new-reasoning-row-is-drawn-through-the-row-beneath-it-until-its-first-measurement.md`; recorded, not repaired,
and not measured in the built app at such a viewport (this host's display is 1,000 px tall).

## Specs

REQ-CHAT-165 ("The desktop MUST keep the whole conversation readable") is what an unbound span at the bottom of the
viewport contradicts. The cause is where two records meet: ADR-0045's capacity rule (`ceil(H_max / 30 px)` plus overscan,
growth only above `H_MAX`) was derived from REQ-CHAT-057's 30 px minimum row height, which PD-CHAT-003 narrows off the
row's box. Whether the capacity unit or the growth condition moves is ADR-0045's to decide, not settled here.

## Relevant files

- `packages/ui/src/transcript/constants.ts` — `ROW_MIN_HEIGHT`, `POOL_CAPACITY`, `capacityFor`.
- `packages/ui/src/transcript/pool.ts` — `visibleRange`'s clamp and the comment that says it cannot bind.
- `packages/ui/src/shell.css` — `.row`'s 4 px margin and `.row--block-start`'s 12 px, which set a one-line row's height.
- `docs/architecture/adr/0045-what-paints-the-transcript.md` — the capacity rule.
