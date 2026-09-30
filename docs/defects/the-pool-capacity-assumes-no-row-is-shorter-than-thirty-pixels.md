## The pool's capacity assumes no row is shorter than 30 px, and PD-CHAT-003 draws rows shorter than that

`POOL_CAPACITY` (`packages/ui/src/transcript/constants.ts`) is `ceil(H_MAX / ROW_MIN_HEIGHT) + OVERSCAN` — 144 slots for
the 4,320 px declared maximum viewport, plus 10, so 154 — and `visibleRange` (`packages/ui/src/transcript/pool.ts`) says a
span wider than the pool "cannot happen while the viewport is inside `H_MAX` (REQ-CHAT-057's 30 px floor bounds the span
by the capacity)". PD-CHAT-003 lifted that floor from the row's box: a row sizes to its content, and the directive's own
text says "real rows may be shorter".

**Measured, 2026-09-30.** A planted transcript of every row kind, read in the built app at a 740 px viewport (slot
heights, which carry the gap above each row): a one-line **system notice inside a block** draws **23.8 px** — `.row`'s
4 px margin, a 1 px border either side and one 17.82 px line of `--rt-text-xs`. Every other one-line row measured draws
30 px or more: an agent message inside a block 33.4 px (its Markdown paragraph keeps an 8 px margin), a user message 41.4
px, a system notice starting a block 31.8 px, a collapsed reasoning row starting a block 33.4 px. So the rows shorter than
the unit are system notices after the first of a run of them — REQ-CHAT-057's attribution rule makes consecutive notices
one block.

**What follows, computed from that figure and not measured at such a viewport** (this host's display is 1,000 px tall).
`visibleRange` binds the visible rows plus `OVERSCAN` above and below, and clamps `last` to `first + capacity - 1`, so a
span of more than 154 rows is cut at the bottom. At the tail, where nothing lies below, that is more than 144 visible
rows — a viewport taller than about 144 × 23.8 ≈ 3,430 px of such notices; scrolled into the middle of them, more than
134 — about 3,190 px. Both are inside `H_MAX`, where the growth branch (`capacityFor`) is never taken, and the rows past
the clamp are not drawn: blank space at the bottom of the transcript. A portrait 4K panel at a scale factor of 1 is such
a viewport; a run of 134 or more consecutive one-line notices is what fills it.

The constant's own comment calls 30 px PD-CHAT-003's "conservative unit" for the slot arithmetic; for capacity, a unit
LARGER than the shortest row is the opposite of conservative. Noticed 2026-09-29 while repairing
`fixed/a-new-reasoning-row-is-drawn-through-the-row-beneath-it-until-its-first-measurement.md`; recorded, not repaired.

**Corrected 2026-09-30, kept beside its replacement:** this note first rested on "a one-line row inside a block is
`.row`'s 4 px margin, a 1 px border either side and one line (19.5 px at `--rt-text-sm` and a 1.5 line height): about
25.5 px — computed, not measured", and a threshold of 144 × 25.5 ≈ 3,670 px. The built app contradicted the row it named:
a one-line agent message inside a block draws 33.4 px, above the unit. The figures above replace it, measured.

## Specs

REQ-CHAT-165 ("The desktop MUST keep the whole conversation readable") is what an unbound span at the bottom of the
viewport contradicts. The cause is where two records meet: ADR-0045's capacity rule (`ceil(H_max / 30 px)` plus overscan,
growth only above `H_MAX`) was derived from REQ-CHAT-057's 30 px minimum row height, which PD-CHAT-003 narrows off the
row's box. Whether the capacity unit or the growth condition moves is ADR-0045's to decide, not settled here.

## Relevant files

- `packages/ui/src/transcript/constants.ts` — `ROW_MIN_HEIGHT`, `POOL_CAPACITY`, `capacityFor`.
- `packages/ui/src/transcript/pool.ts` — `visibleRange`'s clamp and the comment that says it cannot bind.
- `packages/ui/src/shell.css` — `.row`'s 4 px margin, `.row--block-start`'s 12 px and `.row--system .row__body`'s `--rt-text-xs`, which set a one-line notice's height.
- `docs/architecture/adr/0045-what-paints-the-transcript.md` — the capacity rule.
